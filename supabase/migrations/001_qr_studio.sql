-- À exécuter dans le SQL Editor du projet Supabase choisi. Aucune clé dans ce fichier.
create extension if not exists pgcrypto;
create table if not exists public.qr_studio_settings (
  id smallint primary key default 1 check (id = 1),
  price_dzd integer check (price_dzd is null or price_dzd between 1 and 10000000),
  checkout_enabled boolean not null default false,
  announcement text not null default '' check (char_length(announcement) <= 180),
  support_email text not null default '' check (char_length(support_email) <= 254),
  updated_at timestamptz not null default now()
);
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
create index if not exists qr_studio_orders_created on public.qr_studio_orders(created_at desc);

-- Seules les Cloudflare Pages Functions utilisent la clé service_role.
-- Les rôles navigateur ne peuvent lire ni modifier ces tables directement.
alter table public.qr_studio_settings enable row level security;
alter table public.qr_studio_orders enable row level security;
revoke all on public.qr_studio_settings from public, anon, authenticated;
revoke all on public.qr_studio_orders from public, anon, authenticated;
grant all on public.qr_studio_settings to service_role;
grant all on public.qr_studio_orders to service_role;
