-- Allow the resident page to attribute each monthly due to the person who
-- occupied the house in that period. Administrative notes remain private.

drop policy if exists public_read_house_occupancies on public.house_occupancies;
create policy public_read_house_occupancies on public.house_occupancies
for select to anon using (true);

grant select (
  id,
  house_id,
  occupant_name,
  occupant_role,
  start_date,
  end_date
) on public.house_occupancies to anon;

comment on table public.house_occupancies is
  'Historical owner/tenant periods. The person active on the first day of a month is responsible for that month''s mandatory due.';
