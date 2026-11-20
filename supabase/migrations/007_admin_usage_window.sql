-- Le tableau admin affiche les 500 clients les plus récents. Limiter aussi les
-- comptages à cette fenêtre évite qu'une limite PostgREST de 1 000 lignes coupe
-- arbitrairement les compteurs lorsque le nombre total de clients augmente.
begin;
create or replace function public.qr_admin_client_usage()
returns table(user_id uuid, qr_count bigint) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.qr_is_admin() then raise exception 'Accès interdit' using errcode='42501'; end if;
  return query
    select recent.user_id,count(q.id)
    from (select c.user_id from public.qr_studio_clients c
          order by c.created_at desc,c.user_id desc limit 500) recent
    left join public.qr_studio_client_qrs q on q.user_id=recent.user_id
    group by recent.user_id;
end;
$$;
revoke all on function public.qr_admin_client_usage() from public,anon;
grant execute on function public.qr_admin_client_usage() to authenticated;
commit;
