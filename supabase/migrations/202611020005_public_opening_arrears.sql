-- Publish debtor-level opening arrears for the dedicated resident transparency page.

drop policy if exists public_read_opening_arrears_items on public.opening_arrears_items;
create policy public_read_opening_arrears_items on public.opening_arrears_items
for select to anon, authenticated using (true);

grant select (
  id, house_id, debtor_name, debtor_role, cutoff_date, original_amount
) on public.opening_arrears_items to anon;
grant select (opening_arrears_item_id) on public.payments to anon;
