-- Monitoring Iuran CSJ: schema, authorization, and initial 2026 data.
create extension if not exists pgcrypto;

do $$
begin
  create type public.residence_status as enum ('owner_occupied', 'rented', 'empty');
exception
  when duplicate_object then null;
end $$;

-- Preserve the incompatible tables created by the earlier Copilot draft.
-- Nothing is deleted; they are moved to a separate legacy_copilot schema.
create schema if not exists legacy_copilot;

do $$
begin
  if to_regclass('public.houses') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'houses' and column_name = 'owner_name'
    )
  then
    if to_regclass('legacy_copilot.houses') is not null then
      raise exception 'Both public.houses and legacy_copilot.houses exist; manual review is required.';
    end if;
    alter table public.houses set schema legacy_copilot;
  end if;

  if to_regclass('public.payments') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments' and column_name = 'house_id'
    )
  then
    if to_regclass('legacy_copilot.payments') is not null then
      raise exception 'Both public.payments and legacy_copilot.payments exist; manual review is required.';
    end if;
    alter table public.payments set schema legacy_copilot;
  end if;

  if to_regclass('public.expenses') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'expenses' and column_name = 'created_by'
    )
  then
    if to_regclass('legacy_copilot.expenses') is not null then
      raise exception 'Both public.expenses and legacy_copilot.expenses exist; manual review is required.';
    end if;
    alter table public.expenses set schema legacy_copilot;
  end if;

  if to_regclass('public.tariff_history') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tariff_history' and column_name = 'empty_fee'
    )
  then
    if to_regclass('legacy_copilot.tariff_history') is not null then
      raise exception 'Both public.tariff_history and legacy_copilot.tariff_history exist; manual review is required.';
    end if;
    alter table public.tariff_history set schema legacy_copilot;
  end if;

  if to_regclass('public.accounts') is not null then
    if to_regclass('legacy_copilot.accounts') is not null then
      raise exception 'Both public.accounts and legacy_copilot.accounts exist; manual review is required.';
    end if;
    alter table public.accounts set schema legacy_copilot;
  end if;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.houses (
  id smallint primary key check (id between 1 and 36),
  house_no text unique not null,
  owner_name text not null,
  residence_status public.residence_status not null,
  tenant_name text,
  rental_start_date date,
  opening_arrears numeric(14,2) not null default 0 check (opening_arrears >= 0),
  monthly_fee_override numeric(14,2) check (monthly_fee_override >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.houses.opening_arrears is
  'Amount still due through 31 December 2025; entered manually per billing account.';

create table if not exists public.tariff_history (
  id uuid primary key default gen_random_uuid(),
  effective_date date unique not null,
  occupied_fee numeric(14,2) not null check (occupied_fee >= 0),
  empty_fee numeric(14,2) not null check (empty_fee >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  house_id smallint not null references public.houses(id),
  period_month date not null check (extract(day from period_month) = 1),
  payment_date date not null default current_date,
  mandatory_amount numeric(14,2) not null default 0 check (mandatory_amount >= 0),
  arrears_amount numeric(14,2) not null default 0 check (arrears_amount >= 0),
  extra_amount numeric(14,2) not null default 0 check (extra_amount >= 0),
  extra_type text not null default 'None',
  payment_method text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (mandatory_amount + arrears_amount + extra_amount > 0)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists payments_house_month_idx on public.payments (house_id, period_month);
create index if not exists expenses_date_idx on public.expenses (expense_date);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists houses_touch_updated_at on public.houses;
create trigger houses_touch_updated_at
before update on public.houses
for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch_updated_at on public.app_settings;
create trigger settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role) values (new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.tariff_history enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists public_read_houses on public.houses;
drop policy if exists admin_manage_houses on public.houses;
create policy public_read_houses on public.houses
for select to anon, authenticated using (true);
create policy admin_manage_houses on public.houses
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_tariffs on public.tariff_history;
drop policy if exists admin_manage_tariffs on public.tariff_history;
create policy public_read_tariffs on public.tariff_history
for select to anon, authenticated using (true);
create policy admin_manage_tariffs on public.tariff_history
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_payments on public.payments;
drop policy if exists admin_manage_payments on public.payments;
create policy public_read_payments on public.payments
for select to anon, authenticated using (true);
create policy admin_manage_payments on public.payments
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_expenses on public.expenses;
drop policy if exists admin_manage_expenses on public.expenses;
create policy public_read_expenses on public.expenses
for select to anon, authenticated using (true);
create policy admin_manage_expenses on public.expenses
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists public_read_settings on public.app_settings;
drop policy if exists admin_manage_settings on public.app_settings;
create policy public_read_settings on public.app_settings
for select to anon, authenticated using (true);
create policy admin_manage_settings on public.app_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.profiles from anon, authenticated;
revoke all on public.houses from anon, authenticated;
revoke all on public.tariff_history from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.expenses from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.houses, public.tariff_history, public.expenses, public.app_settings to anon;
grant select (
  id, house_id, period_month, payment_date, mandatory_amount,
  arrears_amount, extra_amount, extra_type, created_at
) on public.payments to anon;
grant all on public.houses, public.tariff_history, public.payments, public.expenses, public.app_settings to authenticated;

insert into public.tariff_history (effective_date, occupied_fee, empty_fee, notes)
values ('2026-01-01', 185000, 145000, 'Initial CSJ tariff')
on conflict (effective_date) do nothing;

insert into public.app_settings (key, value)
values
  ('opening_cash_balance', '0'::jsonb),
  ('joint_fee_02_03', '315000'::jsonb),
  ('bank_name', '"Bank Neo Commerce"'::jsonb),
  ('bank_account_number', '"5859457243882555"'::jsonb),
  ('bank_account_holder', '"Suwondo"'::jsonb)
on conflict (key) do nothing;

-- CSJ 2 and CSJ 3 share one Rp315,000 billing account. The legacy override is
-- split between both house rows for compatibility; the app records and reports
-- the pair as a single payer through the joint_fee_02_03 setting.
insert into public.houses (
  id, house_no, owner_name, residence_status, tenant_name,
  rental_start_date, monthly_fee_override
)
values
  (1, 'CSJ 1', 'Dwi Nanung/Ayu', 'rented', 'Ardani/Amelia', '2026-01-01', null),
  (2, 'CSJ 2', 'Anky/Glady', 'owner_occupied', null, null, 157500),
  (3, 'CSJ 3', 'Anky/Glady', 'owner_occupied', null, null, 157500),
  (4, 'CSJ 4', 'Qomar/Intan Widya', 'owner_occupied', null, null, null),
  (5, 'CSJ 5', 'Muh. Basyir / Ova', 'owner_occupied', null, null, null),
  (6, 'CSJ 6', 'Irfan/Windi', 'owner_occupied', null, null, null),
  (7, 'CSJ 7', 'Desis/Koko', 'owner_occupied', null, null, null),
  (8, 'CSJ 8', 'Melda NyataJaya', 'rented', 'Farid/Yanne', '2026-01-01', null),
  (9, 'CSJ 9', 'Sigit', 'rented', 'M. Andi/Nisa', '2026-01-01', null),
  (10, 'CSJ 10', 'Hakim/Indah', 'owner_occupied', null, null, null),
  (11, 'CSJ 11', 'Yuli Adi/Lisa', 'owner_occupied', null, null, null),
  (12, 'CSJ 12', 'Fadel', 'rented', 'Jihad/Risa', '2026-08-01', null),
  (13, 'CSJ 13', 'Nasrul', 'owner_occupied', null, null, null),
  (14, 'CSJ 14', 'Rahmad/Wety', 'owner_occupied', null, null, null),
  (15, 'CSJ 15', 'Ferdian/Yayah', 'owner_occupied', null, null, null),
  (16, 'CSJ 16', 'Sepino/Prima', 'owner_occupied', null, null, null),
  (17, 'CSJ 17', 'Dede/Mega', 'owner_occupied', null, null, null),
  (18, 'CSJ 18', 'Adib A. Rahman', 'owner_occupied', null, null, null),
  (19, 'CSJ 19', 'Deny Haryanto', 'owner_occupied', null, null, null),
  (20, 'CSJ 20', 'Dwi Pratiknyo', 'empty', null, null, null),
  (21, 'CSJ 21', 'Robien', 'owner_occupied', null, null, null),
  (22, 'CSJ 22', 'Suwondo', 'owner_occupied', null, null, null),
  (23, 'CSJ 23', 'Oma', 'owner_occupied', null, null, null),
  (24, 'CSJ 24', 'Tika', 'empty', null, null, null),
  (25, 'CSJ 25', 'Aldhi Givvari', 'owner_occupied', null, null, null),
  (26, 'CSJ 26', 'Ahmad Budiarjo 1', 'rented', 'Babay/Lina', '2026-01-01', null),
  (27, 'CSJ 27', 'Ahmad Budiarjo 2', 'rented', 'Ismail', '2026-01-01', null),
  (28, 'CSJ 28', 'Rolandi Situmorang', 'empty', null, null, null),
  (29, 'CSJ 29', 'Arif Rifana/Gina', 'owner_occupied', null, null, null),
  (30, 'CSJ 30', 'Frans', 'rented', 'Aria Marta', '2026-01-01', null),
  (31, 'CSJ 31', 'Fiqih/Asih', 'owner_occupied', null, null, null),
  (32, 'CSJ 32', 'Yusron', 'owner_occupied', null, null, null),
  (33, 'CSJ 33', 'Rama', 'empty', null, null, null),
  (34, 'CSJ 34', 'Nunik', 'owner_occupied', null, null, null),
  (35, 'CSJ 35', 'Rosyidi/Anizar 1', 'owner_occupied', null, null, null),
  (36, 'CSJ 36', 'Rosyidi/Anizar 1', 'rented', 'Angga/Intan Andriani', '2026-01-01', null)
on conflict (id) do nothing;
