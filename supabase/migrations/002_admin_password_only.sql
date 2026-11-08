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
