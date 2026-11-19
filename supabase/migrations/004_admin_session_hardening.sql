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
