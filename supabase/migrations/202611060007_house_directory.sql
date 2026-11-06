-- Private owner/tenant registers. Do not place phone numbers or KK in app_settings.
begin;
create table public.house_owners (
  id uuid primary key default gen_random_uuid(),
  house_id smallint not null references public.houses(id),
  name text not null check (length(trim(name)) > 0),
  owner_name text not null default '',
  start_date date,
  end_date date,
  phone text not null default '',
  kk_path text not null default '',
  kk_name text not null default '',
  created_at timestamptz not null default now(),
  check (end_date is null or (start_date is not null and end_date >= start_date))
);
create table public.house_tenants (like public.house_owners including all);
alter table public.house_tenants add foreign key (house_id) references public.houses(id);
alter table public.house_owners enable row level security;
alter table public.house_tenants enable row level security;
revoke all on public.house_owners, public.house_tenants from anon, authenticated;
grant select, insert, update, delete on public.house_owners, public.house_tenants to authenticated;
create policy admin_house_owners on public.house_owners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_house_tenants on public.house_tenants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
insert into public.house_owners (house_id, name)
select id, owner_name from public.houses where length(trim(owner_name)) > 0;
insert into public.house_tenants (house_id, name, owner_name, start_date, end_date)
select o.house_id, o.occupant_name, h.owner_name, o.start_date, o.end_date
from public.house_occupancies o join public.houses h on h.id = o.house_id
where o.occupant_role = 'tenant';
-- Unknown ownership dates remain null rather than inventing a date.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-cards', 'family-cards', false, 5242880, array['application/pdf','image/jpeg','image/png']);
create policy admin_family_cards on storage.objects for all to authenticated
  using (bucket_id = 'family-cards' and public.is_admin())
  with check (bucket_id = 'family-cards' and public.is_admin());
alter table public.houses add column vacancy_start_date date;
-- House summary and occupant history change together, under a per-house lock.
create or replace function public.update_house_resident(
  target_house_id smallint, new_owner text, new_status text, new_tenant text, change_date date
) returns void language plpgsql security invoker set search_path = public as $$
declare
  h public.houses%rowtype;
  active public.house_occupancies%rowtype;
  next_name text;
  next_role text;
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  if new_status not in ('owner_occupied', 'rented', 'empty') or change_date is null or change_date > current_date then
    raise exception 'Status atau tanggal perubahan tidak valid';
  end if;
  select * into strict h from public.houses where id = target_house_id for update;
  select * into active from public.house_occupancies where house_id = target_house_id and end_date is null for update;
  next_name := case new_status when 'owner_occupied' then trim(new_owner) when 'rented' then trim(new_tenant) else '' end;
  next_role := case new_status when 'rented' then 'tenant' else 'owner' end;
  if new_status <> 'empty' and coalesce(next_name, '') = '' then raise exception 'Nama penghuni wajib diisi'; end if;
  if active.id is not null and (active.occupant_name <> next_name or active.occupant_role <> next_role) then
    if change_date <= active.start_date then raise exception 'Tanggal perubahan harus setelah tanggal mulai penghuni aktif'; end if;
    update public.house_occupancies set end_date = change_date - 1 where id = active.id;
  end if;
  if next_name <> '' and (active.id is null or active.occupant_name <> next_name or active.occupant_role <> next_role) then
    insert into public.house_occupancies (house_id, occupant_name, occupant_role, start_date)
    values (target_house_id, next_name, next_role, change_date);
  end if;
  update public.houses set owner_name = new_owner, residence_status = new_status::public.residence_status,
    tenant_name = nullif(new_tenant, ''),
    rental_start_date = case when new_status = 'rented' then change_date else null end,
    vacancy_start_date = case when new_status = 'empty' then change_date else null end
  where id = target_house_id;
end;
$$;
revoke all on function public.update_house_resident(smallint,text,text,text,date) from public;
grant execute on function public.update_house_resident(smallint,text,text,text,date) to authenticated;
commit;
