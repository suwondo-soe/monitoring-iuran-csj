-- Import the 2026 payment matrix supplied by the CSJ administrator.
-- Exact transaction dates were not present in the source image, so the first
-- day of each covered month is used as the historical payment date.

alter table public.houses
  add column if not exists billing_start_month date not null default '2026-01-01'
  check (extract(day from billing_start_month) = 1);

update public.houses
set billing_start_month = case id
  when 6 then '2026-05-01'::date
  when 12 then '2026-08-01'::date
  else '2026-01-01'::date
end;

insert into public.app_settings (key, value)
values (
  'pending_payment_months',
  '[{"houseId":4,"month":"2026-04","notes":"Penghuni menyatakan sudah membayar; menunggu bukti pembayaran."}]'::jsonb
)
on conflict (key) do update set value = excluded.value;

with paid_sets (house_id, months, amount) as (
  values
    (1,  array[1,2,3,4,5,6,7,8,9],             185000::numeric),
    (2,  array[1,2,3,4,5,6,7,8,9,10],          315000::numeric),
    (4,  array[1,2,3,5,6,7,8,9],               185000::numeric),
    (5,  array[1,2,3,4,5,6,7,8,9],             185000::numeric),
    (6,  array[5,6,7,8,9,10],                   185000::numeric),
    (7,  array[1,2,3,4,5,6,7,8,9,10,11],       185000::numeric),
    (8,  array[1,2,3,4,5,6,7,8,9,10,11],       185000::numeric),
    (9,  array[1,2,3,4,5,6,7,8,9,10,11,12],    185000::numeric),
    (10, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (11, array[1,2,3,4,5,6,7,8,9,10,11,12],    185000::numeric),
    (12, array[8,9,10,11,12],                   185000::numeric),
    (13, array[1,2,3,4,5,6,7,8],               185000::numeric),
    (14, array[1,2,3,4,5,6,7,8,9],             185000::numeric),
    (15, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (16, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (17, array[1,2,3,4,5,6,7,8],               185000::numeric),
    (18, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (19, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (20, array[2,3,4,5,6,7,8,9,10],            145000::numeric),
    (21, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (22, array[1,2,3,4,5,6,7,8,9,10,11,12],    185000::numeric),
    (23, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (24, array[1,2,3,4,5,6,7],                 145000::numeric),
    (25, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (26, array[1,2,3,4,5,6,7,8,9],             185000::numeric),
    (27, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (29, array[1,2,3,4,5,6,7,8,9,10,11,12],    185000::numeric),
    (30, array[1,2,3,4,5,6,7,8,9,10,11],       185000::numeric),
    (31, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (32, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric),
    (34, array[1,2,3,4,5],                     185000::numeric),
    (35, array[1,2],                           185000::numeric),
    (36, array[1,2,3,4,5,6,7,8,9,10],          185000::numeric)
),
full_payments as (
  select paid_sets.house_id, month_no, paid_sets.amount
  from paid_sets
  cross join lateral unnest(paid_sets.months) as month_no
),
all_imports as (
  select * from full_payments
  union all
  select * from (values
    (7, 12, 110000::numeric),
    (35, 3, 75000::numeric)
  ) as partial_payments (house_id, month_no, amount)
)
insert into public.payments (
  id, house_id, period_month, payment_date, mandatory_amount,
  arrears_amount, extra_amount, extra_type, payment_method, notes
)
select
  gen_random_uuid(),
  payment.house_id,
  make_date(2026, payment.month_no, 1),
  make_date(2026, payment.month_no, 1),
  payment.amount,
  0,
  0,
  'None',
  'Historical import',
  'Imported from user payment matrix 2026'
from all_imports as payment
where not exists (
  select 1
  from public.payments existing
  where existing.house_id = payment.house_id
    and existing.period_month = make_date(2026, payment.month_no, 1)
    and existing.notes = 'Imported from user payment matrix 2026'
);
