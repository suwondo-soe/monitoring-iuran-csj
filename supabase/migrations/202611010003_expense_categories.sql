-- Add a second classification level for cash expenses and receivables.
alter table public.expenses
  add column if not exists detail text;

update public.expenses
set
  detail = case category
    when 'Security' then 'Beban Security'
    when 'Cleaning' then 'Beban Sampah'
    when 'Maintenance' then 'Beban Pembangunan'
    when 'Administration' then 'Beban Administrasi'
    when 'Other' then 'Lainnya'
    else coalesce(nullif(category, ''), 'Lainnya')
  end,
  category = case
    when category in ('Security', 'Cleaning', 'Maintenance', 'Administration') then 'Beban'
    when category = 'Other' then 'Lainnya'
    when category in ('Beban', 'Piutang', 'Lainnya') then category
    else 'Lainnya'
  end
where detail is null;
