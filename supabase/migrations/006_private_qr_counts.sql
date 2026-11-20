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
