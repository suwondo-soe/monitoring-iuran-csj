begin;
-- A known ending can be recorded even when the imported starting date is unknown.
do $$ declare c record; begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
    where conrelid in ('public.house_owners'::regclass, 'public.house_tenants'::regclass)
      and contype = 'c' and pg_get_constraintdef(oid) like '%end_date%'
  loop execute format('alter table %s drop constraint %I', c.tbl, c.conname); end loop;
end $$;
alter table public.house_owners add constraint owner_period_dates check (start_date is null or end_date is null or end_date >= start_date);
alter table public.house_tenants add constraint tenant_period_dates check (start_date is null or end_date is null or end_date >= start_date);
create unique index one_current_owner_per_house on public.house_owners(house_id) where end_date is null;
create unique index one_current_tenant_per_house on public.house_tenants(house_id) where end_date is null;

-- All changes are serialized on the house; validation failures roll back the whole operation.
create or replace function public.save_house_party(p_kind text, p_record jsonb, p_move_in boolean, p_stay_start date)
returns void language plpgsql security invoker set search_path = public as $$
declare
  h public.houses%rowtype;
  old_record public.house_owners%rowtype;
  current_record public.house_owners%rowtype;
  target_id uuid := (p_record->>'id')::uuid;
  target_house smallint := (p_record->>'house_id')::smallint;
  party_name text := trim(p_record->>'name');
  party_start date := nullif(p_record->>'start_date','')::date;
  party_end date := nullif(p_record->>'end_date','')::date;
  table_name text;
  is_new boolean;
  should_transition boolean;
  change_day date;
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  if p_kind is null or p_kind not in ('owners','tenants') then raise exception 'Jenis data tidak valid'; end if;
  table_name := case p_kind when 'owners' then 'house_owners' else 'house_tenants' end;
  select * into strict h from public.houses where id = target_house for update;
  execute format('select * from public.%I where id=$1', table_name) into old_record using target_id;
  is_new := old_record.id is null;
  if not is_new and old_record.house_id <> target_house then raise exception 'Nomor rumah tidak dapat diubah'; end if;
  if is_new then
    if party_name is null or party_name = '' or party_start is null or party_start > current_date or party_end is not null then
      raise exception 'Nama dan tanggal mulai wajib diisi; tanggal mulai tidak boleh di masa depan';
    end if;
    execute format('select * from public.%I where house_id=$1 and end_date is null',table_name) into current_record using target_house;
    if current_record.id is not null and (party_start <= current_record.start_date or lower(trim(current_record.name)) = lower(party_name)) then
      raise exception 'Gunakan Edit untuk pihak yang sama; tanggal pergantian harus setelah tanggal mulai sebelumnya';
    end if;
    execute format('update public.%I set end_date=$1 where house_id=$2 and end_date is null', table_name) using party_start - 1, target_house;
    execute format('insert into public.%I(id,house_id,name,owner_name,start_date,phone,kk_path,kk_name) values($1,$2,$3,$4,$5,$6,$7,$8)',table_name)
      using target_id,target_house,party_name,h.owner_name,party_start,coalesce(p_record->>'phone',''),coalesce(p_record->>'kk_path',''),coalesce(p_record->>'kk_name','');
  else
    -- Editing contact/KK must never silently replace a person or rewrite past billing periods.
    if party_name is distinct from old_record.name or party_start is distinct from old_record.start_date or party_end is distinct from old_record.end_date then
      raise exception 'Gunakan Ganti Pemilik atau Tambah Penyewa untuk perubahan pihak/periode';
    end if;
    execute format('update public.%I set phone=$1,kk_path=$2,kk_name=$3 where id=$4',table_name)
      using coalesce(p_record->>'phone',''),coalesce(p_record->>'kk_path',''),coalesce(p_record->>'kk_name',''),target_id;
  end if;

  if p_kind = 'owners' and is_new then
    update public.houses set owner_name=party_name where id=target_house;
    update public.house_tenants set owner_name=party_name where house_id=target_house and end_date is null;
  end if;
  if p_kind='owners' and p_move_in and not is_new and (old_record.end_date is not null or old_record.name <> h.owner_name) then
    raise exception 'Hanya pemilik saat ini yang dapat mulai tinggal';
  end if;
  should_transition := (p_kind='tenants' and is_new) or (p_kind='owners' and (coalesce(p_move_in,false) or (is_new and h.residence_status='owner_occupied')));
  if should_transition then
    change_day := case when p_move_in or p_kind='tenants' then p_stay_start else party_start end;
    if change_day is null or change_day > current_date or (party_start is not null and change_day < party_start) then raise exception 'Tanggal mulai tinggal tidak valid'; end if;
    if exists(select 1 from public.house_tenants where house_id=target_house and end_date is null and id<>target_id and start_date >= change_day) then
      raise exception 'Tanggal perubahan harus setelah tanggal mulai sewa aktif';
    end if;
    update public.house_tenants set end_date=change_day-1 where house_id=target_house and end_date is null and id<>target_id;
    perform public.update_house_resident(target_house,
      case when p_kind='owners' then party_name else h.owner_name end,
      case when p_kind='tenants' then 'rented' when p_move_in then 'owner_occupied' else 'empty' end,
      case when p_kind='tenants' then party_name else '' end, change_day);
  end if;
end $$;
revoke all on function public.save_house_party(text,jsonb,boolean,date) from public, anon;
grant execute on function public.save_house_party(text,jsonb,boolean,date) to authenticated;

create or replace function public.end_house_residence(p_house_id smallint, p_last_day date)
returns void language plpgsql security invoker set search_path=public as $$
declare h public.houses%rowtype;
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  select * into strict h from public.houses where id=p_house_id for update;
  if h.residence_status='empty' or p_last_day is null or p_last_day >= current_date then raise exception 'Pilih tanggal terakhir tinggal sebelum hari ini'; end if;
  if exists(select 1 from public.house_tenants where house_id=p_house_id and end_date is null and start_date > p_last_day) then raise exception 'Tanggal selesai mendahului tanggal mulai sewa'; end if;
  perform public.update_house_resident(p_house_id,h.owner_name,'empty','',p_last_day+1);
  update public.house_tenants set end_date=p_last_day where house_id=p_house_id and end_date is null;
end $$;
revoke all on function public.end_house_residence(smallint,date) from public, anon;
grant execute on function public.end_house_residence(smallint,date) to authenticated;
revoke all on function public.update_house_resident(smallint,text,text,text,date) from anon;
commit;
