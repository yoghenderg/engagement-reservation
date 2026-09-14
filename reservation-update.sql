-- Run this whole file in Supabase SQL Editor before publishing the new app.
-- Existing replies are retained; their side remains unspecified.
begin;
alter table public.reservations add column if not exists side text;

create or replace function public.reservation_phone_key(p_phone text)
returns text language sql immutable set search_path = pg_catalog as $$
 select case when n like '0060%' then substr(n,3)
             when n like '0%' then '6' || n else n end
 from (select regexp_replace(p_phone, '[^0-9]', '', 'g') n) cleaned;
$$;

-- Protect inserts from older open browser tabs too, without deleting old duplicates.
create or replace function public.guard_reservation_duplicate()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare k text := public.reservation_phone_key(new.phone);
begin
 perform pg_advisory_xact_lock(hashtextextended(k, 0));
 if exists (select 1 from public.reservations r where public.reservation_phone_key(r.phone) = k) then
   raise exception 'A reply already exists for this phone' using errcode = '23505';
 end if;
 return new;
end;
$$;
drop trigger if exists reservation_duplicate_guard on public.reservations;
create trigger reservation_duplicate_guard before insert on public.reservations
for each row execute function public.guard_reservation_duplicate();

create or replace function public.submit_reservation(p_reply jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 n text := trim(p_reply->>'full_name');
 p text := trim(p_reply->>'phone');
 a text := p_reply->>'attending';
 s text := p_reply->>'side';
 g text := p_reply->>'guests';
 m text := p_reply->>'meal';
 rid text := p_reply->>'request_id';
begin
 if now() >= '2026-10-12 00:00:00+08'::timestamptz then
   return jsonb_build_object('closed', true);
 end if;
 if n is null or length(n) not between 2 and 120
    or p is null or p !~ '^[+0-9 ()-]{7,30}$'
    or length(public.reservation_phone_key(p)) not between 7 and 15
    or a is null or a not in ('yes','no')
    or s is null or s not in ('mappilai','ponnu')
    or rid is null or length(rid) not between 1 and 100
    or (a = 'yes' and (g is null or g not in ('1','2','3','4','5','6+')
       or m is null or m not in ('vegetarian','non-vegetarian'))) then
    raise exception 'Invalid reservation details' using errcode = '22023';
 end if;
 begin
   insert into public.reservations(request_id,full_name,phone,attending,guests,meal,side)
   values(rid,n,p,a,case when a='yes' then g end,case when a='yes' then m end,s);
 exception when unique_violation then
   return jsonb_build_object('ok',true,'duplicate',true);
 end;
 return jsonb_build_object('ok',true,'duplicate',false);
end;
$$;
revoke all on function public.submit_reservation(jsonb) from public;
grant execute on function public.submit_reservation(jsonb) to anon;

-- Change the return shape while preserving the existing login.
drop function if exists public.admin_reservations(text,text);
create function public.admin_reservations(p_username text,p_password text)
returns table(id bigint,request_id text,full_name text,phone text,attending text,guests text,meal text,created_at timestamptz,side text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if p_username is distinct from 'Always&Forever' or p_password is distinct from '24092026' then
   raise exception 'Invalid admin login' using errcode = '28000';
 end if;
 return query select r.id,r.request_id,r.full_name,r.phone,r.attending,r.guests,r.meal,r.created_at,r.side
 from public.reservations r order by r.created_at desc;
end;
$$;
revoke all on function public.admin_reservations(text,text) from public;
grant execute on function public.admin_reservations(text,text) to anon;
commit;
