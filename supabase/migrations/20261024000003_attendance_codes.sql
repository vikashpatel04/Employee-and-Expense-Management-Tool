-- Phase 7: self attendance by the shop's 6-digit attendance code (docs/PLAN.md §4.5).
--
--   * attendance_codes: the shop's codes, newest = current. Not readable through the API at all;
--     `attendance_code()` shows the current one to people with `attendance.code`, and
--     `check_in()` compares against it. Stored as plain digits: a hash of a 6-digit code can be
--     reversed by trying all million (docs/DECISIONS.md), so the protection is that nobody can
--     read the table.
--   * Rotation follows shops.settings.attendanceCode (core `CodeSettings`): daily at a chosen
--     time (IST) — a new code is made the first time one is needed after that time — or only
--     when someone regenerates it.
--   * attendance_scans: every check-in / check-out attempt (time, device, scan or typed, result),
--     append-only. The rules in `private.check_in_at` mirror core `evaluateCheck`; a test runs
--     the same scenarios through both.
--   * A staff member checks in only when `staff.self_attendance` is on, from the phone bound to
--     them (`staff.device_id`; the first check-in binds it if no phone is bound yet).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.attendance_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  valid_from timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by)
);
create index attendance_codes_shop_idx on public.attendance_codes (shop_id, valid_from desc);
create index attendance_codes_created_by_idx on public.attendance_codes (shop_id, created_by);

create table public.attendance_scans (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  at timestamptz not null default now(),
  device_id text,
  method text not null check (method in ('scan', 'typed')),
  kind text check (kind in ('in', 'out')),
  result text not null check (result in ('accepted', 'wrong_code', 'locked', 'cooldown',
    'too_soon', 'already_checked_out', 'self_off', 'wrong_device')),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  check ((result = 'accepted') = (kind is not null))
);
create index attendance_scans_staff_idx on public.attendance_scans (staff_id, at desc);
create index attendance_scans_shop_idx on public.attendance_scans (shop_id, at desc);

alter table public.attendance_codes enable row level security;
alter table public.attendance_scans enable row level security;

-- Codes: no policies and no grants — only the functions below touch them.
revoke all on public.attendance_codes from anon, authenticated;

-- Attempts: the person themselves, and whoever watches the code screen or marks attendance.
create policy attendance_scans_read on public.attendance_scans for select to authenticated
  using (
    private.is_self(staff_id)
    or private.has_permission(shop_id, 'attendance.code')
    or private.has_permission(shop_id, 'attendance.mark')
  );
revoke all on public.attendance_scans from anon;
revoke insert, update, delete on public.attendance_scans from authenticated;

-- ---------------------------------------------------------------------------
-- Settings and the current code
-- ---------------------------------------------------------------------------

-- shops.settings.attendanceCode with the core defaults (DEFAULT_CODE_SETTINGS) filled in.
create function private.code_settings(p_shop uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'rotationMode', coalesce(c #>> '{rotation,mode}', 'daily'),
    'atMinutes', coalesce((c #>> '{rotation,atMinutes}')::int, 0),
    'minGapMinutes', coalesce((c ->> 'minGapMinutes')::int, 30),
    'cooldownMinutes', coalesce((c ->> 'cooldownMinutes')::int, 2),
    'checkOutRequired', coalesce((c ->> 'checkOutRequired')::boolean, true),
    'maxWrongCodes', coalesce((c ->> 'maxWrongCodes')::int, 5),
    'wrongCodeWindowMinutes', coalesce((c ->> 'wrongCodeWindowMinutes')::int, 10),
    'lockoutMinutes', coalesce((c ->> 'lockoutMinutes')::int, 10)
  )
  from (select coalesce(s.settings -> 'attendanceCode', '{}'::jsonb) as c
        from public.shops s where s.id = p_shop) x
$$;

-- The latest daily rotation instant at or before p_now (IST, at `p_at` minutes past midnight).
create function private.last_rotation(p_now timestamptz, p_at int)
returns timestamptz
language sql immutable set search_path = ''
as $$
  select case when r > p_now then r - interval '1 day' else r end
  from (select (date_trunc('day', p_now at time zone 'Asia/Kolkata')
                + make_interval(mins => p_at)) at time zone 'Asia/Kolkata' as r) x
$$;

-- When the code next changes by itself (null when it only changes on regenerate).
create function private.next_rotation(p_shop uuid, p_now timestamptz)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select case when s ->> 'rotationMode' = 'daily'
    then private.last_rotation(p_now, (s ->> 'atMinutes')::int) + interval '1 day' end
  from (select private.code_settings(p_shop) as s) x
$$;

-- A random 6-digit code from a strong random source, different from `p_not`.
create function private.new_code(p_not text)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  c text;
begin
  loop
    c := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint
              % 1000000)::text, 6, '0');
    exit when c is distinct from p_not;
  end loop;
  return c;
end;
$$;

-- The shop's current code, making a new one when there is none yet or the daily change time
-- has passed since the latest. One caller at a time per shop (row lock on the shop).
create function private.current_code(p_shop uuid, p_now timestamptz, p_by uuid)
returns public.attendance_codes
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.attendance_codes;
  s jsonb := private.code_settings(p_shop);
begin
  perform 1 from public.shops where id = p_shop for update;
  select * into c from public.attendance_codes
  where shop_id = p_shop order by valid_from desc, created_at desc limit 1;
  if c.id is null
     or (s ->> 'rotationMode' = 'daily'
         and c.valid_from < private.last_rotation(p_now, (s ->> 'atMinutes')::int)) then
    insert into public.attendance_codes (shop_id, code, valid_from, created_by)
    values (p_shop, private.new_code(c.code), p_now, p_by)
    returning * into c;
  end if;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- API: see / regenerate the code (attendance.code)
-- ---------------------------------------------------------------------------
create function public.attendance_code(p_shop uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.attendance_codes;
begin
  if not private.has_permission(p_shop, 'attendance.code') then
    raise exception 'Not allowed to see the attendance code' using errcode = 'insufficient_privilege';
  end if;
  c := private.current_code(p_shop, now(), private.person_id(p_shop));
  return jsonb_build_object(
    'code', c.code,
    'validFrom', c.valid_from,
    'nextChange', private.next_rotation(p_shop, now())
  );
end;
$$;

create function public.regenerate_attendance_code(p_shop uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  old text;
begin
  if not private.has_permission(p_shop, 'attendance.code') then
    raise exception 'Not allowed to change the attendance code' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.shops where id = p_shop for update;
  select code into old from public.attendance_codes
  where shop_id = p_shop order by valid_from desc, created_at desc limit 1;
  insert into public.attendance_codes (shop_id, code, valid_from, created_by)
  values (p_shop, private.new_code(old), now(), private.person_id(p_shop));
  return public.attendance_code(p_shop);
end;
$$;

-- ---------------------------------------------------------------------------
-- Check in / check out
-- ---------------------------------------------------------------------------

-- Self attendance is written by `check_in_at` while the staff member is signed in, so the
-- stamp can't rely on "no signed-in user" any more: check_in_at sets a transaction-local flag
-- and the stamp keeps those rows as source 'self' with no marker.
create or replace function private.stamp_attendance()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_setting('fincrew.self_check', true) = 'on' then
    new.source := 'self';
    new.marked_by := null;
  elsif auth.uid() is not null then
    new.marked_by := private.person_id(new.shop_id);
    new.source := 'manual';
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_attendance() from public, anon, authenticated;

-- When the wrong-code wait ends for a staff member (core `lockedUntil`): `maxWrongCodes`
-- wrong codes within `wrongCodeWindowMinutes` → wait `lockoutMinutes` from the last of them.
create function private.code_locked_until(p_staff uuid, p_now timestamptz, s jsonb)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select max(at + make_interval(mins => (s ->> 'lockoutMinutes')::int))
  from (
    select at, lag(at, (s ->> 'maxWrongCodes')::int - 1) over (order by at) as first
    from public.attendance_scans
    where staff_id = p_staff and result = 'wrong_code'
      and at > p_now - make_interval(mins => (s ->> 'wrongCodeWindowMinutes')::int
                                             + (s ->> 'lockoutMinutes')::int)
      and at <= p_now
  ) w
  where first is not null
    and at - first <= make_interval(mins => (s ->> 'wrongCodeWindowMinutes')::int)
$$;

-- One attempt at `p_now` (tests pass their own time; the API passes now()). Returns
-- { ok, kind | reason, retryAt?, at } and records the attempt.
create function private.check_in_at(
  p_shop uuid, p_person uuid, p_code text, p_method text, p_device text, p_now timestamptz
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  st public.staff;
  s jsonb := private.code_settings(p_shop);
  v_result text;
  v_kind text;
  v_retry timestamptz;
  v_until timestamptz;
  v_last timestamptz;
  v_day date := (p_now at time zone 'Asia/Kolkata')::date;
  a public.attendance;
begin
  if p_method is null or p_method not in ('scan', 'typed') then
    raise exception 'Method must be scan or typed' using errcode = 'check_violation';
  end if;
  if p_device is null or length(trim(p_device)) < 8 then
    raise exception 'A device id is required' using errcode = 'check_violation';
  end if;

  select * into st from public.staff
  where shop_id = p_shop and person_id = p_person for update;
  if st.person_id is null or st.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;

  if not st.self_attendance then
    v_result := 'self_off';
  elsif st.device_id is not null and st.device_id <> p_device then
    v_result := 'wrong_device';
  else
    v_until := private.code_locked_until(p_person, p_now, s);
    if v_until > p_now then
      v_result := 'locked';
      v_retry := v_until;
    elsif p_code is distinct from (private.current_code(p_shop, p_now, null)).code then
      v_result := 'wrong_code';
    else
      select max(at) into v_last from public.attendance_scans
      where staff_id = p_person and result = 'accepted' and at <= p_now;
      if v_last + make_interval(mins => (s ->> 'cooldownMinutes')::int) > p_now then
        v_result := 'cooldown';
        v_retry := v_last + make_interval(mins => (s ->> 'cooldownMinutes')::int);
      else
        select * into a from public.attendance where staff_id = p_person and date = v_day;
        if a.check_in is null then
          v_result := 'accepted';
          v_kind := 'in';
        elsif a.check_out is not null then
          v_result := 'already_checked_out';
        elsif a.check_in + make_interval(mins => (s ->> 'minGapMinutes')::int) > p_now then
          v_result := 'too_soon';
          v_retry := a.check_in + make_interval(mins => (s ->> 'minGapMinutes')::int);
        else
          v_result := 'accepted';
          v_kind := 'out';
        end if;
      end if;
    end if;
  end if;

  perform set_config('fincrew.self_check', 'on', true);
  if v_kind = 'in' then
    insert into public.attendance (shop_id, staff_id, date, status, check_in, source)
    values (p_shop, p_person, v_day, 'present', p_now, 'self')
    on conflict (staff_id, date) do update set
      check_in = excluded.check_in,
      source = 'self',
      status = case when public.attendance.status in ('present', 'half_day')
                    then public.attendance.status else 'present' end;
  elsif v_kind = 'out' then
    update public.attendance set check_out = p_now
    where staff_id = p_person and date = v_day;
  end if;
  perform set_config('fincrew.self_check', '', true);
  if v_kind is not null and st.device_id is null then
    update public.staff set device_id = p_device where person_id = p_person;
  end if;

  insert into public.attendance_scans (shop_id, staff_id, at, device_id, method, kind, result)
  values (p_shop, p_person, p_now, p_device, p_method, v_kind, v_result);

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', v_result = 'accepted',
    'kind', v_kind,
    'reason', case when v_result <> 'accepted' then v_result end,
    'retryAt', v_retry,
    'at', p_now
  ));
end;
$$;

-- Staffora: the signed-in staff member checks in or out with the code they scanned or typed.
create function public.check_in(p_shop uuid, p_code text, p_method text, p_device text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := private.person_id(p_shop);
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  return private.check_in_at(p_shop, me, trim(coalesce(p_code, '')), p_method, p_device, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.code_settings(uuid), private.last_rotation(timestamptz, int),
  private.next_rotation(uuid, timestamptz), private.new_code(text),
  private.current_code(uuid, timestamptz, uuid), private.code_locked_until(uuid, timestamptz, jsonb),
  private.check_in_at(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.code_settings(uuid), private.last_rotation(timestamptz, int),
  private.next_rotation(uuid, timestamptz), private.new_code(text),
  private.current_code(uuid, timestamptz, uuid), private.code_locked_until(uuid, timestamptz, jsonb),
  private.check_in_at(uuid, uuid, text, text, text, timestamptz)
  to service_role;

revoke all on function public.attendance_code(uuid), public.regenerate_attendance_code(uuid),
  public.check_in(uuid, text, text, text) from public, anon;
grant execute on function public.attendance_code(uuid), public.regenerate_attendance_code(uuid),
  public.check_in(uuid, text, text, text) to authenticated;
