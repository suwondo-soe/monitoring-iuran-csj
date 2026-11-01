-- CSJ 04 has confirmed payment for April 2026, so the former pending marker is no longer needed.
insert into public.app_settings (key, value)
values ('pending_payment_months', '[]'::jsonb)
on conflict (key) do update
set value = excluded.value;
