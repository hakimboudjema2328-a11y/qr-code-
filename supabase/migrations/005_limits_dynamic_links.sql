-- Quotas par client et liens QR désactivables. Les anciens QR restent statiques.
-- Aucune limite n'est imposée aux comptes existants (NULL = illimité).
begin;
alter table public.qr_studio_clients add column if not exists qr_limit integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='qr_client_limit_range' and conrelid='public.qr_studio_clients'::regclass) then
    alter table public.qr_studio_clients add constraint qr_client_limit_range check (qr_limit is null or qr_limit between 0 and 100000);
  end if;
end $$;
alter table public.qr_studio_client_qrs add column if not exists is_dynamic boolean not null default false;
alter table public.qr_studio_client_qrs add column if not exists scan_count bigint not null default 0;
alter table public.qr_studio_client_qrs add column if not exists last_scanned_at timestamptz;
grant select (qr_limit) on public.qr_studio_clients to authenticated;
grant update (qr_limit) on public.qr_studio_clients to authenticated;
grant select (is_dynamic,scan_count,last_scanned_at) on public.qr_studio_client_qrs to authenticated;

-- Création et contrôle du quota sous le même verrou : deux créations simultanées
-- ne peuvent pas dépasser la limite. Les anciens appels conservent leur signature.
create or replace function public.qr_create_client_qr_v2(
  p_id uuid,p_user_id uuid,p_version uuid,p_session uuid,p_title text,p_qr_type text,p_ciphertext text,p_iv text,p_dynamic boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare c public.qr_studio_clients%rowtype; recent integer; used_count bigint;
begin
  select * into c from public.qr_studio_clients where user_id=p_user_id for update;
  if not found or not c.is_active or c.access_version <> p_version or not exists
    (select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user_id) then return 'account_unavailable'; end if;
  if exists (select 1 from public.qr_studio_client_qrs where id=p_id and user_id=p_user_id) then return 'exists'; end if;
  if c.expires_at is not null and c.expires_at <= clock_timestamp() then return 'expired'; end if;
  if p_dynamic is null or (p_dynamic and p_qr_type not in ('url','whatsapp')) then return 'invalid'; end if;
  if c.qr_limit is not null then
    select count(*) into used_count from public.qr_studio_client_qrs where user_id=p_user_id;
    if used_count >= c.qr_limit then return 'quota_reached'; end if;
  end if;
  select count(*) into recent from public.qr_studio_client_qrs where user_id=p_user_id and created_at > clock_timestamp()-interval '1 minute';
  if recent >= 20 then return 'rate_limited'; end if;
  insert into public.qr_studio_client_qrs(id,user_id,title,qr_type,snapshot_ciphertext,snapshot_iv,is_dynamic)
    values (p_id,p_user_id,p_title,p_qr_type,p_ciphertext,p_iv,p_dynamic);
  return 'ok';
end;
$$;
create or replace function public.qr_create_client_qr(
  p_id uuid,p_user_id uuid,p_version uuid,p_session uuid,p_title text,p_qr_type text,p_ciphertext text,p_iv text
) returns text language sql security definer set search_path = '' as $$
  select public.qr_create_client_qr_v2(p_id,p_user_id,p_version,p_session,p_title,p_qr_type,p_ciphertext,p_iv,false);
$$;
revoke all on function public.qr_create_client_qr_v2(uuid,uuid,uuid,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.qr_create_client_qr_v2(uuid,uuid,uuid,uuid,text,text,text,text,boolean) to service_role;
revoke all on function public.qr_create_client_qr(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.qr_create_client_qr(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

-- La suppression d'un QR reste possible après expiration et libère une place.
create or replace function public.qr_delete_client_qr(p_id uuid,p_user_id uuid,p_version uuid,p_session uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.qr_studio_clients%rowtype; deleted integer;
begin
  select * into c from public.qr_studio_clients where user_id=p_user_id for update;
  if not found or not c.is_active or c.access_version <> p_version or not exists
    (select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user_id) then return 'account_unavailable'; end if;
  delete from public.qr_studio_client_qrs where id=p_id and user_id=p_user_id;
  get diagnostics deleted = row_count;
  if deleted=0 then return 'not_found'; end if;
  return 'ok';
end;
$$;
revoke all on function public.qr_delete_client_qr(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.qr_delete_client_qr(uuid,uuid,uuid,uuid) to service_role;

-- Une ouverture de lien est comptée sans conserver adresse IP, appareil ou identité.
-- Le service de résolution seul peut lire les données chiffrées ; aucun accès anonyme SQL.
create or replace function public.qr_resolve_client_qr(p_id uuid)
returns table(id uuid,user_id uuid,snapshot_ciphertext text,snapshot_iv text)
language sql volatile security definer set search_path = '' as $$
  update public.qr_studio_client_qrs q
     set scan_count=case when q.scan_count < 9223372036854775807 then q.scan_count+1 else q.scan_count end,
         last_scanned_at=clock_timestamp()
    from public.qr_studio_clients c
   where q.id=p_id and q.is_dynamic and c.user_id=q.user_id and c.is_active
   returning q.id,q.user_id,q.snapshot_ciphertext,q.snapshot_iv;
$$;
revoke all on function public.qr_resolve_client_qr(uuid) from public,anon,authenticated;
grant execute on function public.qr_resolve_client_qr(uuid) to service_role;

-- Une prolongation part du plus récent entre maintenant et l'échéance.
-- Un accès sans date de fin reste illimité et ne peut pas être raccourci par erreur.
create or replace function public.qr_extend_client(p_user_id uuid,p_days integer)
returns table(status text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare c public.qr_studio_clients%rowtype; next_expiry timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 36500 then return query select 'invalid'::text,null::timestamptz; return; end if;
  select * into c from public.qr_studio_clients where user_id=p_user_id for update;
  if not found then return query select 'not_found'::text,null::timestamptz; return; end if;
  if c.expires_at is null then return query select 'unlimited'::text,null::timestamptz; return; end if;
  next_expiry := greatest(c.expires_at,clock_timestamp()) + make_interval(days=>p_days);
  update public.qr_studio_clients set expires_at=next_expiry,updated_at=clock_timestamp() where user_id=p_user_id;
  return query select 'ok'::text,next_expiry;
end;
$$;
revoke all on function public.qr_extend_client(uuid,integer) from public,anon,authenticated;
grant execute on function public.qr_extend_client(uuid,integer) to service_role;
commit;
