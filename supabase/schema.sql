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
