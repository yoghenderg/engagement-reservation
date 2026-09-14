-- Run this entire migration once in a NEW Supabase SQL Editor query.
-- Keeps existing replies and duplicate protection. Old 6+ replies remain estimates.
begin;
alter table public.reservations add column if not exists vegetarian_count integer;
alter table public.reservations add column if not exists non_vegetarian_count integer;
alter table public.reservations add column if not exists either_count integer;
alter table public.reservations drop constraint if exists reservations_guests_check;
alter table public.reservations add constraint reservations_guests_check check
 (guests is null or guests = '6+' or guests ~ '^([1-9]|[1-4][0-9]|50)$');
update public.reservations set
 vegetarian_count=case when attending='yes' and meal='vegetarian' then replace(guests,'+','')::integer else 0 end,
 non_vegetarian_count=case when attending='yes' and meal='non-vegetarian' then replace(guests,'+','')::integer else 0 end,
 either_count=0
where vegetarian_count is null and non_vegetarian_count is null and either_count is null;
alter table public.reservations drop constraint if exists reservation_meal_totals;
alter table public.reservations add constraint reservation_meal_totals check (
 vegetarian_count is not null and non_vegetarian_count is not null and either_count is not null
 and vegetarian_count>=0 and non_vegetarian_count>=0 and either_count>=0
 and vegetarian_count+non_vegetarian_count+either_count = case when attending='yes' then replace(guests,'+','')::integer else 0 end);
-- Require the validated submission function for new replies.
revoke insert on public.reservations from anon;
create or replace function public.submit_reservation(p_reply jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
 n text := trim(p_reply->>'full_name');
 p text := trim(p_reply->>'phone');
 a text := p_reply->>'attending';
 s text := p_reply->>'side';
 g text := p_reply->>'guests';
 v integer := (p_reply->>'vegetarian_count')::integer;
 nv integer := (p_reply->>'non_vegetarian_count')::integer;
 e integer := (p_reply->>'either_count')::integer;
 rid text := p_reply->>'request_id';
begin
 -- Keep already-open versions of the form working during the rollout.
 if a='yes' and not (p_reply ? 'vegetarian_count') and p_reply->>'meal' in ('vegetarian','non-vegetarian') then
   if g='6+' then g:='6'; end if;
   if g ~ '^[0-9]{1,2}$' then
     v:=case when p_reply->>'meal'='vegetarian' then g::integer else 0 end;
     nv:=case when p_reply->>'meal'='non-vegetarian' then g::integer else 0 end;
     e:=0;
   end if;
 end if;
 if now() >= '2026-10-12 00:00:00+08'::timestamptz then
   return jsonb_build_object('closed', true);
 end if;
 if n is null or length(n) not between 2 and 120
    or p is null or p !~ '^[+0-9 ()-]{7,30}$'
    or length(public.reservation_phone_key(p)) not between 7 and 15
    or a is null or a not in ('yes','no')
    or s is null or s not in ('mappilai','ponnu')
    or rid is null or length(rid) not between 1 and 100
    or (a = 'yes' and (g is null or g !~ '^[0-9]{1,2}$'
       or v is null or nv is null or e is null or v < 0 or nv < 0 or e < 0)) then
    raise exception 'Invalid reservation details' using errcode = '22023';
 end if;
 if a='yes' and (g::integer not between 1 and 50 or v+nv+e <> g::integer) then
   raise exception 'Meal counts must match guests' using errcode='22023';
 end if;
 begin
   insert into public.reservations(request_id,full_name,phone,attending,guests,meal,side,vegetarian_count,non_vegetarian_count,either_count)
   values(rid,n,p,a,case when a='yes' then g end,null,s,case when a='yes' then v else 0 end,case when a='yes' then nv else 0 end,case when a='yes' then e else 0 end);
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
returns table(id bigint,request_id text,full_name text,phone text,attending text,guests text,meal text,created_at timestamptz,side text,vegetarian_count integer,non_vegetarian_count integer,either_count integer)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if p_username is distinct from 'Always&Forever' or p_password is distinct from '24092026' then
   raise exception 'Invalid admin login' using errcode = '28000';
 end if;
 return query select r.id,r.request_id,r.full_name,r.phone,r.attending,r.guests,r.meal,r.created_at,r.side,r.vegetarian_count,r.non_vegetarian_count,r.either_count
 from public.reservations r order by r.created_at desc;
end;
$$;
revoke all on function public.admin_reservations(text,text) from public;
grant execute on function public.admin_reservations(text,text) to anon;
commit;
