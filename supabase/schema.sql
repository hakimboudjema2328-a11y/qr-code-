-- QR Studio — à exécuter dans le SQL Editor du projet Supabase choisi.
-- Ne contient ni clé, ni utilisateur, ni mot de passe par défaut.
create extension if not exists pgcrypto;

create table if not exists public.qr_studio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.qr_studio_settings (
  id smallint primary key default 1 check (id = 1),
  price_dzd integer check (price_dzd is null or price_dzd between 1 and 10000000),
  checkout_enabled boolean not null default false,
  payment_mode text not null default 'test' check (payment_mode in ('test','live')),
  announcement text not null default '' check (char_length(announcement) <= 180),
  support_email text not null default '' check (char_length(support_email) <= 254),
  updated_at timestamptz not null default now()
);
-- Compatible avec l'ancien schéma QR Studio si cette table existe déjà.
alter table public.qr_studio_settings add column if not exists payment_mode text not null default 'test' check (payment_mode in ('test','live'));
insert into public.qr_studio_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.qr_studio_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_email text not null,
  attempt_id uuid not null,
  status text not null default 'creating' check (status in ('creating','pending','paid','failed','canceled','error')),
  amount_dzd integer not null check (amount_dzd > 0),
  currency text not null default 'dzd' check (currency = 'dzd'),
  payment_mode text not null check (payment_mode in ('test', 'live')),
  qr_type text not null check (qr_type in ('url','text','whatsapp','wifi','email','phone','sms','contact')),
  snapshot_ciphertext text not null,
  snapshot_iv text not null,
  provider_checkout_id text unique,
  provider_checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(user_id, attempt_id)
);
create index if not exists qr_studio_orders_user_created on public.qr_studio_orders(user_id, created_at desc);
create index if not exists qr_studio_orders_mode_created on public.qr_studio_orders(payment_mode, created_at desc);

-- Défini par le propriétaire SQL, sans possibilité de s'auto-attribuer un rôle.
create or replace function public.qr_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.qr_studio_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.qr_is_admin() from public, anon;
grant execute on function public.qr_is_admin() to authenticated;

alter table public.qr_studio_admins enable row level security;
alter table public.qr_studio_settings enable row level security;
alter table public.qr_studio_orders enable row level security;
revoke all on public.qr_studio_admins from public, anon, authenticated;
revoke all on public.qr_studio_settings from public, anon, authenticated;
revoke all on public.qr_studio_orders from public, anon, authenticated;
grant select on public.qr_studio_settings to anon, authenticated;
grant update (price_dzd, checkout_enabled, payment_mode, announcement, support_email, updated_at) on public.qr_studio_settings to authenticated;
-- Le brouillon chiffré et l'ID fournisseur ne sont jamais lisibles par le navigateur.
grant select (id, user_id, customer_email, status, amount_dzd, currency, payment_mode, qr_type,
  provider_checkout_url, created_at, updated_at, paid_at) on public.qr_studio_orders to authenticated;
grant all on public.qr_studio_admins, public.qr_studio_settings, public.qr_studio_orders to service_role;

drop policy if exists qr_settings_read on public.qr_studio_settings;
create policy qr_settings_read on public.qr_studio_settings for select to anon, authenticated using (true);
drop policy if exists qr_settings_admin_update on public.qr_studio_settings;
create policy qr_settings_admin_update on public.qr_studio_settings for update to authenticated
  using (public.qr_is_admin()) with check (public.qr_is_admin());
drop policy if exists qr_orders_read on public.qr_studio_orders;
create policy qr_orders_read on public.qr_studio_orders for select to authenticated
  using (user_id = auth.uid() or public.qr_is_admin());

create or replace function public.qr_admin_stats(p_mode text default 'live')
returns table(paid_count bigint, revenue_dzd bigint, pending_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.qr_is_admin() then raise exception 'Accès interdit' using errcode = '42501'; end if;
  if p_mode not in ('live','test') then raise exception 'Mode invalide' using errcode = '22023'; end if;
  return query select count(*) filter (where status = 'paid'),
    coalesce(sum(amount_dzd) filter (where status = 'paid'), 0)::bigint,
    count(*) filter (where status in ('pending','creating'))
    from public.qr_studio_orders where payment_mode = p_mode;
end;
$$;
revoke all on function public.qr_admin_stats(text) from public, anon;
grant execute on function public.qr_admin_stats(text) to authenticated;

-- APRÈS création du compte administrateur via Supabase Auth :
-- insert into public.qr_studio_admins(user_id)
-- select id from auth.users where email = 'votre-adresse@example.com'
-- on conflict (user_id) do nothing;

-- La connexion admin par mot de passe seul est limitée côté serveur.
-- Protection globale de la connexion administrateur par mot de passe.
-- Ne stocke ni mot de passe ni adresse e-mail.
create table if not exists public.qr_studio_admin_login_guard (
  id smallint primary key default 1 check (id = 1),
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
insert into public.qr_studio_admin_login_guard (id) values (1) on conflict (id) do nothing;
alter table public.qr_studio_admin_login_guard enable row level security;
revoke all on public.qr_studio_admin_login_guard from public, anon, authenticated;
grant all on public.qr_studio_admin_login_guard to service_role;

-- Une ligne verrouillée rend l'incrément atomique, même sous requêtes concurrentes.
create or replace function public.qr_admin_login_allow()
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; start_at timestamptz;
begin
  select attempts, window_start into n, start_at
    from public.qr_studio_admin_login_guard where id = 1 for update;
  if not found then return false; end if;
  if start_at <= clock_timestamp() - interval '15 minutes' then
    update public.qr_studio_admin_login_guard set attempts = 1, window_start = clock_timestamp() where id = 1;
    return true;
  elsif n >= 8 then
    return false;
  end if;
  update public.qr_studio_admin_login_guard set attempts = n + 1 where id = 1;
  return true;
end;
$$;
create or replace function public.qr_admin_login_reset()
returns void language sql security definer set search_path = '' as $$
  update public.qr_studio_admin_login_guard set attempts = 0, window_start = clock_timestamp() where id = 1;
$$;
revoke all on function public.qr_admin_login_allow() from public, anon, authenticated;
revoke all on function public.qr_admin_login_reset() from public, anon, authenticated;
grant execute on function public.qr_admin_login_allow() to service_role;
grant execute on function public.qr_admin_login_reset() to service_role;
-- Coordonnées publiques modifiables uniquement par l’administrateur.
alter table public.qr_studio_settings add column if not exists whatsapp_number text not null default '213799888645' check (whatsapp_number ~ '^[1-9][0-9]{7,14}$');
alter table public.qr_studio_settings add column if not exists instagram_url text not null default 'https://www.instagram.com/massify_services/' check (char_length(instagram_url) <= 300 and (instagram_url = '' or instagram_url ~ '^https://(www[.])?instagram[.]com/[A-Za-z0-9_.]+/?$'));
alter table public.qr_studio_settings add column if not exists facebook_url text not null default 'https://www.facebook.com/profile.php?id=61594892763460&locale=fr_FR' check (char_length(facebook_url) <= 500 and (facebook_url = '' or facebook_url ~ '^https://(www[.])?facebook[.]com/[^[:space:]<>]+$'));
grant update(whatsapp_number,instagram_url,facebook_url) on public.qr_studio_settings to authenticated;

-- Abonnements réglés hors ligne : ne crée aucun prix ni client par défaut.
-- Les anciennes commandes sont conservées mais la création de paiement est fermée.
update public.qr_studio_settings set checkout_enabled = false where id = 1;

create table if not exists public.qr_studio_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 350),
  price_dzd integer check (price_dzd is null or price_dzd between 0 and 10000000),
  duration_days integer check (duration_days is null or duration_days between 1 and 36500),
  is_active boolean not null default true,
  position integer not null default 0 check (position between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.qr_studio_clients (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_name text not null check (char_length(trim(client_name)) between 1 and 80),
  phone text not null default '' check (char_length(phone) <= 30),
  plan_id uuid references public.qr_studio_plans(id) on delete set null,
  plan_name text not null default '' check (char_length(plan_name) <= 80),
  expires_at timestamptz,
  is_active boolean not null default true,
  access_version uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qr_studio_clients_created on public.qr_studio_clients(created_at desc);
create table if not exists public.qr_studio_client_qrs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.qr_studio_clients(user_id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  qr_type text not null check (qr_type in ('url','text','whatsapp','wifi','email','phone','sms','contact')),
  snapshot_ciphertext text not null check (char_length(snapshot_ciphertext) <= 600000),
  snapshot_iv text not null check (char_length(snapshot_iv) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists qr_studio_client_qrs_owner_created on public.qr_studio_client_qrs(user_id, created_at desc);

-- Pour qu'un code renouvelé ou un compte désactivé coupe immédiatement les
-- anciennes sessions, y compris les JWT dont l'expiration n'est pas atteinte.
create or replace function public.qr_client_session_valid()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.qr_studio_clients c
    join auth.sessions s on s.user_id = c.user_id
    where c.user_id = auth.uid() and c.is_active
      and c.access_version::text = (auth.jwt() -> 'app_metadata' ->> 'qr_access_version')
      and s.id::text = (auth.jwt() ->> 'session_id')
  );
$$;
revoke all on function public.qr_client_session_valid() from public, anon;
grant execute on function public.qr_client_session_valid() to authenticated;

alter table public.qr_studio_plans enable row level security;
alter table public.qr_studio_clients enable row level security;
alter table public.qr_studio_client_qrs enable row level security;
revoke all on public.qr_studio_plans, public.qr_studio_clients, public.qr_studio_client_qrs from public, anon, authenticated;
grant select on public.qr_studio_plans to anon, authenticated;
grant insert(name, description, price_dzd, duration_days, is_active, position),
  update(name, description, price_dzd, duration_days, is_active, position, updated_at)
  on public.qr_studio_plans to authenticated;
grant select (user_id,client_name,phone,plan_id,plan_name,expires_at,is_active,created_at,updated_at)
  on public.qr_studio_clients to authenticated;
grant update (client_name,phone,plan_id,plan_name,expires_at,is_active,updated_at)
  on public.qr_studio_clients to authenticated;
-- Les brouillons chiffrés ne sont pas accessibles par PostgREST aux clients.
grant select (id,user_id,title,qr_type,created_at) on public.qr_studio_client_qrs to authenticated;
grant all on public.qr_studio_plans, public.qr_studio_clients, public.qr_studio_client_qrs to service_role;

drop policy if exists qr_plans_public_read on public.qr_studio_plans;
create policy qr_plans_public_read on public.qr_studio_plans for select to anon using (is_active);
drop policy if exists qr_plans_auth_read on public.qr_studio_plans;
create policy qr_plans_auth_read on public.qr_studio_plans for select to authenticated using (is_active or public.qr_is_admin());
drop policy if exists qr_plans_admin_insert on public.qr_studio_plans;
create policy qr_plans_admin_insert on public.qr_studio_plans for insert to authenticated with check (public.qr_is_admin());
drop policy if exists qr_plans_admin_update on public.qr_studio_plans;
create policy qr_plans_admin_update on public.qr_studio_plans for update to authenticated using (public.qr_is_admin()) with check (public.qr_is_admin());
drop policy if exists qr_clients_read on public.qr_studio_clients;
create policy qr_clients_read on public.qr_studio_clients for select to authenticated using (public.qr_is_admin() or (user_id = auth.uid() and public.qr_client_session_valid()));
drop policy if exists qr_clients_admin_update on public.qr_studio_clients;
create policy qr_clients_admin_update on public.qr_studio_clients for update to authenticated using (public.qr_is_admin()) with check (public.qr_is_admin());
drop policy if exists qr_client_qrs_read on public.qr_studio_client_qrs;
create policy qr_client_qrs_read on public.qr_studio_client_qrs for select to authenticated using (public.qr_is_admin() or (user_id = auth.uid() and public.qr_client_session_valid()));

create table if not exists public.qr_studio_client_login_guard (
  bucket text primary key check (bucket ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.qr_studio_client_login_guard enable row level security;
revoke all on public.qr_studio_client_login_guard from public, anon, authenticated;
grant all on public.qr_studio_client_login_guard to service_role;
create or replace function public.qr_client_login_allow(p_bucket text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_bucket !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.qr_studio_client_login_guard as g (bucket,window_start,attempts)
    values (p_bucket,clock_timestamp(),1)
  on conflict (bucket) do update set
    attempts = case when g.window_start <= clock_timestamp() - interval '15 minutes' then 1 else g.attempts + 1 end,
    window_start = case when g.window_start <= clock_timestamp() - interval '15 minutes' then clock_timestamp() else g.window_start end
  returning attempts into n;
  return n <= 20;
end;
$$;
revoke all on function public.qr_client_login_allow(text) from public, anon, authenticated;
grant execute on function public.qr_client_login_allow(text) to service_role;

-- Contrôle atomique d'une création : le statut et l'échéance sont vérifiés
-- à l'instant de l'enregistrement, sous verrou, sans faire confiance au client.
create or replace function public.qr_create_client_qr(
  p_id uuid,p_user_id uuid,p_version uuid,p_session uuid,p_title text,p_qr_type text,p_ciphertext text,p_iv text
) returns text language plpgsql security definer set search_path = '' as $$
declare c public.qr_studio_clients%rowtype; recent integer;
begin
  select * into c from public.qr_studio_clients where user_id=p_user_id for update;
  if not found or not c.is_active or c.access_version <> p_version or not exists
    (select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user_id) then return 'account_unavailable'; end if;
  if exists (select 1 from public.qr_studio_client_qrs where id=p_id and user_id=p_user_id) then return 'exists'; end if;
  if c.expires_at is not null and c.expires_at <= clock_timestamp() then return 'expired'; end if;
  select count(*) into recent from public.qr_studio_client_qrs where user_id=p_user_id and created_at > clock_timestamp()-interval '1 minute';
  if recent >= 20 then return 'rate_limited'; end if;
  insert into public.qr_studio_client_qrs(id,user_id,title,qr_type,snapshot_ciphertext,snapshot_iv)
    values (p_id,p_user_id,p_title,p_qr_type,p_ciphertext,p_iv);
  return 'ok';
end;
$$;
revoke all on function public.qr_create_client_qr(uuid,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.qr_create_client_qr(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

create or replace function public.qr_admin_overview()
returns table(clients_total bigint, clients_active bigint, qr_total bigint, plans_active bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.qr_is_admin() then raise exception 'Accès interdit' using errcode = '42501'; end if;
  return query select
    (select count(*) from public.qr_studio_clients),
    (select count(*) from public.qr_studio_clients where is_active and (expires_at is null or expires_at > now())),
    (select count(*) from public.qr_studio_client_qrs),
    (select count(*) from public.qr_studio_plans where is_active);
end;
$$;
revoke all on function public.qr_admin_overview() from public, anon;
grant execute on function public.qr_admin_overview() to authenticated;
-- Un ancien JWT admin ne conserve pas de droits après déconnexion.
create or replace function public.qr_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.qr_studio_admins a
    join auth.sessions s on s.user_id = a.user_id
    where a.user_id = auth.uid() and s.id::text = (auth.jwt() ->> 'session_id')
  );
$$;
revoke all on function public.qr_is_admin() from public, anon;
grant execute on function public.qr_is_admin() to authenticated;
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
-- Comptages sans exposer les colonnes chiffrées aux clients PostgREST.
begin;
create or replace function public.qr_client_qr_usage()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare result bigint;
begin
  if not public.qr_client_session_valid() then raise exception 'Accès interdit' using errcode='42501'; end if;
  select count(*) into result from public.qr_studio_client_qrs q where q.user_id=auth.uid();
  return result;
end;
$$;
revoke all on function public.qr_client_qr_usage() from public,anon;
grant execute on function public.qr_client_qr_usage() to authenticated;

create or replace function public.qr_admin_client_usage()
returns table(user_id uuid, qr_count bigint) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.qr_is_admin() then raise exception 'Accès interdit' using errcode='42501'; end if;
  return query select c.user_id,count(q.id) from public.qr_studio_clients c
    left join public.qr_studio_client_qrs q on q.user_id=c.user_id
    group by c.user_id;
end;
$$;
revoke all on function public.qr_admin_client_usage() from public,anon;
grant execute on function public.qr_admin_client_usage() to authenticated;
commit;
