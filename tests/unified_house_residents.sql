-- Run after migration 008 in Supabase SQL Editor. All test changes roll back.
begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.profiles where role='admin' limit 1), true);
do $$
declare
  target_house smallint;
  owner_b uuid := gen_random_uuid(); owner_c uuid := gen_random_uuid();
  tenant_a uuid := gen_random_uuid(); tenant_b uuid := gen_random_uuid();
  row_data jsonb;
  initial_count bigint := (select count(*) from public.houses);
begin
  if not public.is_admin() then raise exception 'No admin identity available for rollback test'; end if;
  select h.id into strict target_house from public.houses h join public.house_owners o on o.house_id=h.id and o.end_date is null
    where h.residence_status='empty' and (o.start_date is null or o.start_date<current_date-10)
    order by h.id limit 1;
  perform public.save_house_party('owners',jsonb_build_object('id',owner_b,'house_id',target_house,'name','QA owner B','start_date',current_date-6),false,null);
  assert (select residence_status='empty' from public.houses where id=target_house), 'Nonresident sale should remain empty';
  perform public.save_house_party('tenants',jsonb_build_object('id',tenant_a,'house_id',target_house,'name','QA tenant A','start_date',current_date-5),true,current_date-5);
  assert (select count(*)=1 from public.house_occupancies where house_id=target_house and end_date is null and occupant_name='QA tenant A'), 'Tenant did not become occupant';
  perform public.save_house_party('owners',jsonb_build_object('id',owner_c,'house_id',target_house,'name','QA owner C','start_date',current_date-4),false,null);
  assert (select end_date is null and owner_name='QA owner C' from public.house_tenants where id=tenant_a), 'Sale should retain tenant and update owner';
  assert (select occupant_name='QA tenant A' from public.house_occupancies where house_id=target_house and end_date is null), 'Sale unexpectedly replaced tenant';
  select to_jsonb(o) || jsonb_build_object('phone','QA contact') into row_data from public.house_owners o where id=owner_c;
  perform public.save_house_party('owners',row_data,false,null);
  assert (select phone='QA contact' from public.house_owners where id=owner_c), 'Contact edit failed';
  perform public.save_house_party('tenants',jsonb_build_object('id',tenant_b,'house_id',target_house,'name','QA tenant B','start_date',current_date-3),true,current_date-3);
  assert (select end_date=current_date-4 from public.house_tenants where id=tenant_a), 'Previous tenant period not closed';
  perform public.end_house_residence(target_house,current_date-2);
  assert (select residence_status='empty' and vacancy_start_date=current_date-1 from public.houses where id=target_house), 'Vacancy date incorrect';
  assert (select end_date=current_date-2 from public.house_tenants where id=tenant_b), 'Tenant ending incorrect';
  select to_jsonb(o) into row_data from public.house_owners o where id=owner_c;
  perform public.save_house_party('owners',row_data,true,current_date-1);
  assert (select residence_status='owner_occupied' and owner_name='QA owner C' from public.houses where id=target_house), 'Existing owner did not move in';
  assert (select count(*)=initial_count from public.houses), 'Number of houses changed';
  assert not has_function_privilege('anon','public.save_house_party(text,jsonb,boolean,date)','execute'), 'Anonymous mutation allowed';
  begin
    perform public.save_house_party('tenants',jsonb_build_object('id',gen_random_uuid(),'house_id',target_house,'name','QA invalid','start_date',current_date-8),true,current_date-8);
    raise exception 'Backdated registration incorrectly accepted';
  exception when others then
    if sqlerrm='Backdated registration incorrectly accepted' then raise; end if;
  end;
  assert (select residence_status='owner_occupied' from public.houses where id=target_house), 'Rejected operation was not atomic';
end $$;
rollback;
select 'Owner/tenant/resident transactions passed; all test changes rolled back' as result;
