create or replace function public.admin_reservations(
  p_username text,
  p_password text
)
returns table (
  id bigint,
  request_id text,
  full_name text,
  phone text,
  attending text,
  guests text,
  meal text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_username <> 'Always&Forever' or p_password <> '24092026' then
    raise exception 'Invalid admin login' using errcode = '28000';
  end if;

  return query
  select
    r.id,
    r.request_id,
    r.full_name,
    r.phone,
    r.attending,
    r.guests,
    r.meal,
    r.created_at
  from public.reservations r
  order by r.created_at desc;
end;
$$;

revoke all on function public.admin_reservations(text, text) from public;
grant execute on function public.admin_reservations(text, text) to anon;

