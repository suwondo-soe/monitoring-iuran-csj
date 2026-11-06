-- Household members are private personal data. Public visitors can only read
-- completion status and aggregate statistics; details require the household PIN.
create extension if not exists pgcrypto;

create table if not exists public.household_submissions (
  id uuid primary key default gen_random_uuid(),
  house_id smallint not null references public.houses(id),
  resident_name text not null,
  resident_key text not null,
  edit_code_hash text not null,
  kk_path text not null default '',
  kk_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (house_id, resident_key)
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.household_submissions(id) on delete cascade,
  sort_order integer not null check (sort_order > 0),
  name text not null check (length(trim(name)) > 0),
  gender text not null check (gender in ('male', 'female')),
  relationship text not null check (relationship in ('Kepala Keluarga', 'Istri', 'Anak', 'Cucu', 'Orang Tua', 'Mertua', 'Lainnya')),
  birth_date date not null,
  in_family_card boolean not null,
  lives_in_house boolean not null,
  created_at timestamptz not null default now(),
  unique (submission_id, sort_order)
);

create index if not exists household_members_submission_idx
  on public.household_members(submission_id, sort_order);

alter table public.household_submissions enable row level security;
alter table public.household_members enable row level security;

drop policy if exists admin_household_submissions on public.household_submissions;
create policy admin_household_submissions on public.household_submissions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_household_members on public.household_members;
create policy admin_household_members on public.household_members
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.household_submissions from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
grant select, insert, update, delete on public.household_submissions to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;

create or replace function public.household_name_key(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '[^[:alnum:]]+', '', 'g');
$$;

create or replace function public.current_household_resident(p_house_id smallint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when h.residence_status::text = 'rented' then coalesce(nullif(trim(h.tenant_name), ''), h.owner_name)
    when h.residence_status::text = 'owner_occupied' then h.owner_name
    else ''
  end
  from public.houses h
  where h.id = p_house_id;
$$;

create or replace function public.get_household_submission_status()
returns table (
  house_id smallint,
  resident_name text,
  member_count bigint,
  lives_in_house_count bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.house_id, s.resident_name,
    count(m.id) as member_count,
    count(m.id) filter (where m.lives_in_house) as lives_in_house_count,
    s.updated_at
  from public.household_submissions s
  join public.houses h on h.id = s.house_id
  left join public.household_members m on m.submission_id = s.id
  where s.resident_key = public.household_name_key(
    case
      when h.residence_status::text = 'rented' then coalesce(nullif(trim(h.tenant_name), ''), h.owner_name)
      when h.residence_status::text = 'owner_occupied' then h.owner_name
      else ''
    end
  )
  group by s.id;
$$;

create or replace function public.get_household_statistics()
returns table (category text, label text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with current_submissions as (
    select s.id
    from public.household_submissions s
    join public.houses h on h.id = s.house_id
    where s.resident_key = public.household_name_key(
      case
        when h.residence_status::text = 'rented' then coalesce(nullif(trim(h.tenant_name), ''), h.owner_name)
        when h.residence_status::text = 'owner_occupied' then h.owner_name
        else ''
      end
    )
  ), current_members as (
    select m.* from public.household_members m join current_submissions s on s.id = m.submission_id
  ), statistic_rows as (
    select 'summary'::text category, 'Total anggota tercatat'::text label, count(*)::bigint total from current_members
    union all select 'summary', 'Tinggal bersama di rumah', count(*) filter (where lives_in_house) from current_members
    union all select 'summary', 'Rumah sudah mengisi', count(*) from current_submissions
    union all select 'gender', case gender when 'male' then 'Laki-laki' else 'Perempuan' end, count(*) from current_members group by gender
    union all select 'age', case
      when extract(year from age(current_date, birth_date)) <= 5 then '0–5 tahun'
      when extract(year from age(current_date, birth_date)) <= 12 then '6–12 tahun'
      when extract(year from age(current_date, birth_date)) <= 17 then '13–17 tahun'
      when extract(year from age(current_date, birth_date)) <= 25 then '18–25 tahun'
      when extract(year from age(current_date, birth_date)) <= 40 then '26–40 tahun'
      when extract(year from age(current_date, birth_date)) <= 59 then '41–59 tahun'
      else '60+ tahun' end, count(*) from current_members group by 2
    union all select 'relationship', relationship, count(*) from current_members group by relationship
    union all select 'family_card', case when in_family_card then 'Anggota KK' else 'Bukan anggota KK' end, count(*) from current_members group by in_family_card
    union all select 'residence', case when lives_in_house then 'Tinggal di rumah' else 'Tidak tinggal di rumah' end, count(*) from current_members group by lives_in_house
  )
  select statistic_rows.category, statistic_rows.label, statistic_rows.total from statistic_rows;
$$;

create or replace function public.load_household_submission(
  p_house_id smallint,
  p_resident_name text,
  p_edit_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  submission public.household_submissions%rowtype;
begin
  select * into submission
  from public.household_submissions s
  where s.house_id = p_house_id
    and s.resident_key = public.household_name_key(p_resident_name);

  if submission.id is null or submission.edit_code_hash <> crypt(p_edit_code, submission.edit_code_hash) then
    raise exception 'Kode pembaruan tidak sesuai.';
  end if;

  return jsonb_build_object(
    'id', submission.id,
    'house_id', submission.house_id,
    'resident_name', submission.resident_name,
    'member_count', (select count(*) from public.household_members m where m.submission_id = submission.id),
    'lives_in_house_count', (select count(*) from public.household_members m where m.submission_id = submission.id and m.lives_in_house),
    'updated_at', submission.updated_at,
    'kk_name', submission.kk_name,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'gender', m.gender, 'relationship', m.relationship,
      'birth_date', m.birth_date, 'in_family_card', m.in_family_card,
      'lives_in_house', m.lives_in_house, 'sort_order', m.sort_order
    ) order by m.sort_order) from public.household_members m where m.submission_id = submission.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_household_submission(
  p_house_id smallint,
  p_resident_name text,
  p_edit_code text,
  p_members jsonb,
  p_kk_path text default null,
  p_kk_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  submission public.household_submissions%rowtype;
  current_resident text;
  member jsonb;
  submission_id uuid;
  member_birth_date date;
begin
  current_resident := public.current_household_resident(p_house_id);
  if current_resident is null or current_resident = '' or public.household_name_key(current_resident) <> public.household_name_key(p_resident_name) then
    raise exception 'Penghuni aktif rumah ini sudah berubah. Muat ulang halaman sebelum menyimpan.';
  end if;
  if p_edit_code !~ '^[0-9]{6}$' then raise exception 'Kode pembaruan harus terdiri dari 6 angka.'; end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then raise exception 'Isi minimal satu anggota keluarga.'; end if;
  if p_kk_path is not null and p_kk_path <> '' and split_part(p_kk_path, '/', 1) <> p_house_id::text then
    raise exception 'Lokasi berkas KK tidak sesuai dengan rumah yang dipilih.';
  end if;

  select * into submission from public.household_submissions s
  where s.house_id = p_house_id and s.resident_key = public.household_name_key(p_resident_name)
  for update;

  if submission.id is null then
    insert into public.household_submissions(house_id, resident_name, resident_key, edit_code_hash, kk_path, kk_name)
    values (p_house_id, trim(p_resident_name), public.household_name_key(p_resident_name), crypt(p_edit_code, gen_salt('bf')),
      coalesce(p_kk_path, ''), coalesce(p_kk_name, ''))
    returning id into submission_id;
  else
    if submission.edit_code_hash <> crypt(p_edit_code, submission.edit_code_hash) then raise exception 'Kode pembaruan tidak sesuai.'; end if;
    submission_id := submission.id;
    update public.household_submissions set
      resident_name = trim(p_resident_name),
      kk_path = case when nullif(p_kk_path, '') is null then kk_path else p_kk_path end,
      kk_name = case when nullif(p_kk_path, '') is null then kk_name else coalesce(p_kk_name, '') end,
      updated_at = now()
    where id = submission_id;
    delete from public.household_members where household_members.submission_id = submission_id;
  end if;

  for member in select value from jsonb_array_elements(p_members)
  loop
    if trim(coalesce(member->>'name', '')) = ''
      or coalesce(member->>'gender', '') not in ('male', 'female')
      or coalesce(member->>'relationship', '') not in ('Kepala Keluarga', 'Istri', 'Anak', 'Cucu', 'Orang Tua', 'Mertua', 'Lainnya')
      or not (member ? 'in_family_card') or not (member ? 'lives_in_house') then
      raise exception 'Data anggota keluarga belum lengkap.';
    end if;
    member_birth_date := (member->>'birth_date')::date;
    if member_birth_date > current_date then raise exception 'Tanggal lahir tidak boleh berada di masa depan.'; end if;
    insert into public.household_members(id, submission_id, sort_order, name, gender, relationship, birth_date, in_family_card, lives_in_house)
    values (
      coalesce(nullif(member->>'id', '')::uuid, gen_random_uuid()), submission_id,
      coalesce((member->>'sort_order')::integer, 1), initcap(lower(trim(member->>'name'))),
      member->>'gender', member->>'relationship', member_birth_date,
      (member->>'in_family_card')::boolean, (member->>'lives_in_house')::boolean
    );
  end loop;

  return submission_id;
end;
$$;

revoke all on function public.get_household_submission_status() from public;
revoke all on function public.get_household_statistics() from public;
revoke all on function public.load_household_submission(smallint, text, text) from public;
revoke all on function public.save_household_submission(smallint, text, text, jsonb, text, text) from public;
grant execute on function public.get_household_submission_status() to anon, authenticated;
grant execute on function public.get_household_statistics() to anon, authenticated;
grant execute on function public.load_household_submission(smallint, text, text) to anon, authenticated;
grant execute on function public.save_household_submission(smallint, text, text, jsonb, text, text) to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('household-family-cards', 'household-family-cards', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists household_kk_public_insert on storage.objects;
create policy household_kk_public_insert on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'household-family-cards' and (storage.foldername(name))[1] ~ '^[0-9]+$');

drop policy if exists household_kk_admin_access on storage.objects;
create policy household_kk_admin_access on storage.objects
for all to authenticated
using (bucket_id = 'household-family-cards' and public.is_admin())
with check (bucket_id = 'household-family-cards' and public.is_admin());

comment on table public.household_submissions is 'Private household survey keyed by house and the current resident.';
comment on column public.household_submissions.kk_path is 'Optional private KK upload path.';
