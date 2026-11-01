-- Preserve occupant changes and identify who owns each opening arrears balance.

create table if not exists public.house_occupancies (
  id uuid primary key default gen_random_uuid(),
  house_id smallint not null references public.houses(id) on delete cascade,
  occupant_name text not null check (length(trim(occupant_name)) > 0),
  occupant_role text not null check (occupant_role in ('owner', 'tenant')),
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists one_current_occupancy_per_house
  on public.house_occupancies (house_id)
  where end_date is null;

create index if not exists house_occupancies_house_dates_idx
  on public.house_occupancies (house_id, start_date desc);

create table if not exists public.opening_arrears_items (
  id uuid primary key default gen_random_uuid(),
  house_id smallint references public.houses(id) on delete set null,
  occupancy_id uuid references public.house_occupancies(id) on delete set null,
  debtor_name text not null check (length(trim(debtor_name)) > 0),
  debtor_role text not null check (debtor_role in ('owner', 'tenant', 'former_tenant', 'unassigned')),
  cutoff_date date not null default date '2025-12-31',
  original_amount numeric(14,2) not null check (original_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opening_arrears_items_house_idx
  on public.opening_arrears_items (house_id, cutoff_date);

alter table public.payments
  add column if not exists opening_arrears_item_id uuid
  references public.opening_arrears_items(id) on delete set null;

create index if not exists payments_opening_arrears_item_idx
  on public.payments (opening_arrears_item_id)
  where opening_arrears_item_id is not null;

drop trigger if exists house_occupancies_touch_updated_at on public.house_occupancies;
create trigger house_occupancies_touch_updated_at
before update on public.house_occupancies
for each row execute function public.touch_updated_at();

drop trigger if exists opening_arrears_items_touch_updated_at on public.opening_arrears_items;
create trigger opening_arrears_items_touch_updated_at
before update on public.opening_arrears_items
for each row execute function public.touch_updated_at();

create or replace function public.recalculate_house_opening_arrears(target_house_id smallint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.houses
  set opening_arrears = coalesce((
    select sum(item.original_amount)
    from public.opening_arrears_items item
    where item.house_id = target_house_id
  ), 0)
  where id = target_house_id;
$$;

create or replace function public.sync_house_opening_arrears_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.house_id is not null then
    perform public.recalculate_house_opening_arrears(old.house_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.house_id is not null then
    perform public.recalculate_house_opening_arrears(new.house_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists opening_arrears_items_sync_house on public.opening_arrears_items;
create trigger opening_arrears_items_sync_house
after insert or update or delete on public.opening_arrears_items
for each row execute function public.sync_house_opening_arrears_from_item();

revoke all on function public.recalculate_house_opening_arrears(smallint) from public;
revoke all on function public.sync_house_opening_arrears_from_item() from public;

alter table public.house_occupancies enable row level security;
alter table public.opening_arrears_items enable row level security;

drop policy if exists admin_manage_house_occupancies on public.house_occupancies;
create policy admin_manage_house_occupancies on public.house_occupancies
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_manage_opening_arrears_items on public.opening_arrears_items;
create policy admin_manage_opening_arrears_items on public.opening_arrears_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.house_occupancies from anon, authenticated;
revoke all on public.opening_arrears_items from anon, authenticated;
grant all on public.house_occupancies, public.opening_arrears_items to authenticated;

-- Establish the current occupant as the first traceable period.
insert into public.house_occupancies (
  house_id, occupant_name, occupant_role, start_date, notes
)
select
  h.id,
  case when h.residence_status = 'rented' then h.tenant_name else h.owner_name end,
  case when h.residence_status = 'rented' then 'tenant' else 'owner' end,
  case
    when h.residence_status = 'rented' then coalesce(h.rental_start_date, date '2026-01-01')
    else date '2026-01-01'
  end,
  'Data penghuni aktif saat riwayat mulai digunakan'
from public.houses h
where h.residence_status <> 'empty'
  and coalesce(case when h.residence_status = 'rented' then h.tenant_name else h.owner_name end, '') <> ''
  and not exists (
    select 1 from public.house_occupancies o
    where o.house_id = h.id and o.end_date is null
  );

-- Preserve every existing house-level opening balance before adding debtor detail.
insert into public.opening_arrears_items (
  house_id, debtor_name, debtor_role, cutoff_date, original_amount, notes
)
select
  h.id,
  h.owner_name,
  'owner',
  date '2025-12-31',
  h.opening_arrears,
  'Migrasi saldo tunggakan rumah yang sudah ada'
from public.houses h
where h.opening_arrears > 0
  and not exists (
    select 1 from public.opening_arrears_items item
    where item.house_id = h.id
      and item.notes = 'Migrasi saldo tunggakan rumah yang sudah ada'
  );

-- Known former tenants whose previous house still needs to be identified.
insert into public.opening_arrears_items (
  house_id, debtor_name, debtor_role, cutoff_date, original_amount, notes
)
select null, seed.debtor_name, 'former_tenant', date '2025-12-31', seed.amount,
  'Mantan penyewa; nomor rumah lama belum ditentukan'
from (values
  ('Antares Yurman', 4910000::numeric),
  ('Nico Mursyid', 2820000::numeric)
) as seed(debtor_name, amount)
where not exists (
  select 1 from public.opening_arrears_items item
  where lower(item.debtor_name) = lower(seed.debtor_name)
    and item.cutoff_date = date '2025-12-31'
);

-- Opening arrears belonging to owners of currently rented houses.
insert into public.opening_arrears_items (
  house_id, debtor_name, debtor_role, cutoff_date, original_amount, notes
)
select seed.house_id, seed.debtor_name, 'owner', date '2025-12-31', seed.amount,
  'Tunggakan pemilik; rumah saat ini disewakan'
from (values
  (26::smallint, 'Ahmad Budiarjo 1', 435000::numeric),
  (27::smallint, 'Ahmad Budiarjo 2', 145000::numeric)
) as seed(house_id, debtor_name, amount)
where not exists (
  select 1 from public.opening_arrears_items item
  where item.house_id = seed.house_id
    and lower(item.debtor_name) = lower(seed.debtor_name)
    and item.cutoff_date = date '2025-12-31'
);

comment on table public.house_occupancies is
  'Historical owner/tenant occupancy periods used to trace responsibility over time.';
comment on table public.opening_arrears_items is
  'Debtor-level opening arrears as of a cutoff date. Linked arrears payments reduce the current outstanding balance.';
comment on column public.payments.opening_arrears_item_id is
  'Identifies which debtor-level opening arrears item is settled by arrears_amount.';
