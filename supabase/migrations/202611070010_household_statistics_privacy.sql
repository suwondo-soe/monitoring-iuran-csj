-- Do not expose household-member aggregates until at least ten current
-- households have submitted the form. The one privacy row below only reports
-- form completion, which is already visible in the public red/green house grid.
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
  ), privacy_gate as (
    select count(*)::bigint as completed_households from current_submissions
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
  select statistic_rows.category, statistic_rows.label, statistic_rows.total
  from statistic_rows cross join privacy_gate
  where privacy_gate.completed_households >= 10
  union all
  select 'privacy'::text, 'Rumah sudah mengisi'::text, privacy_gate.completed_households
  from privacy_gate
  where privacy_gate.completed_households < 10;
$$;

revoke all on function public.get_household_statistics() from public;
grant execute on function public.get_household_statistics() to anon, authenticated;

comment on function public.get_household_statistics() is
  'Returns household aggregates only after ten current households have submitted; below the threshold returns completion count only.';
