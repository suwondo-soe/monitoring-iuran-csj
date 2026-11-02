-- Dedicated cash receipts for opening arrears through 31 December 2025.

create table if not exists public.opening_arrears_payments (
  id uuid primary key default gen_random_uuid(),
  opening_arrears_item_id uuid not null references public.opening_arrears_items(id) on delete restrict,
  payment_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opening_arrears_payments_item_date_idx
  on public.opening_arrears_payments (opening_arrears_item_id, payment_date desc);

drop trigger if exists opening_arrears_payments_touch_updated_at on public.opening_arrears_payments;
create trigger opening_arrears_payments_touch_updated_at
before update on public.opening_arrears_payments
for each row execute function public.touch_updated_at();

alter table public.opening_arrears_payments enable row level security;

drop policy if exists public_read_opening_arrears_payments on public.opening_arrears_payments;
create policy public_read_opening_arrears_payments on public.opening_arrears_payments
for select to anon, authenticated using (true);

drop policy if exists admin_manage_opening_arrears_payments on public.opening_arrears_payments;
create policy admin_manage_opening_arrears_payments on public.opening_arrears_payments
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.opening_arrears_payments from anon, authenticated;
grant select (id, opening_arrears_item_id, payment_date, amount)
  on public.opening_arrears_payments to anon;
grant all on public.opening_arrears_payments to authenticated;

comment on table public.opening_arrears_payments is
  'Cash receipts that settle debtor-level opening arrears through 31 December 2025.';
