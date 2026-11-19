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
