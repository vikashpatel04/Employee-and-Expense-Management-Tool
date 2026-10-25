-- Staffora sign-in by phone number instead of invite links (owner's decision, 2026-10-25).
--
--   * The phone number FinCrew has for a staff member is their Staffora user id. The first time,
--     they type it in Staffora and choose a 4-digit PIN (`pin_setup`, via the `staff-auth` edge
--     function); afterwards phone + PIN sign them in (`pin_login`, unchanged rules).
--   * Numbers match however they were typed (`private.phone_key`, same rule as core `phoneKey`).
--     Only active staff (not the owner) are found; a number on two active staff is refused.
--   * Forgot the PIN: someone with staff.edit resets it (`reset_pin`); the person then sets a new
--     one from their bound phone. Staffora stays tied to one phone (`staff.device_id`).
--   * The invite links (table `invites` and its functions) are removed.
--   * shops.settings.staffLogin: `inviteHours` is gone, `allowBiometrics` (default true) is new.

-- ---------------------------------------------------------------------------
-- Phone numbers
-- ---------------------------------------------------------------------------
create function private.phone_key(p_phone text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  d text := ltrim(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '0');
begin
  if length(d) = 12 and left(d, 2) = '91' then
    d := substr(d, 3);
  end if;
  return case when d ~ '^[0-9]{10}$' then d end;
end;
$$;

create index people_phone_key_idx on public.people (private.phone_key(phone))
  where phone is not null;

-- The one active staff member with this number, or why not: not_found | left | many.
create function private.staff_by_phone(p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  k text := private.phone_key(p_phone);
  n int;
  p public.people;
begin
  if k is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select count(*) into n
  from public.people pp join public.staff s on s.person_id = pp.id
  where private.phone_key(pp.phone) = k and not pp.is_owner and s.status = 'active';
  if n > 1 then
    return jsonb_build_object('ok', false, 'reason', 'many');
  elsif n = 0 then
    if exists (select 1 from public.people pp join public.staff s on s.person_id = pp.id
               where private.phone_key(pp.phone) = k and not pp.is_owner) then
      return jsonb_build_object('ok', false, 'reason', 'left');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select pp.* into p
  from public.people pp join public.staff s on s.person_id = pp.id
  where private.phone_key(pp.phone) = k and not pp.is_owner and s.status = 'active';
  return jsonb_build_object(
    'ok', true,
    'personId', p.id,
    'shopId', p.shop_id,
    'firstName', split_part(trim(p.name), ' ', 1),
    'shopName', (select name from public.shops where id = p.shop_id),
    'hasPin', exists (select 1 from public.pin_credentials c where c.person_id = p.id),
    'authUserId', p.auth_user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings: no invite hours; fingerprint / face unlock allowed by default
-- ---------------------------------------------------------------------------
create or replace function private.login_settings(p_shop uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'wrongPinsBeforeWait', coalesce((l ->> 'wrongPinsBeforeWait')::int, 5),
    'pinWaitMinutes', coalesce((l ->> 'pinWaitMinutes')::int, 15),
    'wrongPinsBeforeLock', coalesce((l ->> 'wrongPinsBeforeLock')::int, 10),
    'allowBiometrics', coalesce((l ->> 'allowBiometrics')::boolean, true)
  )
  from (select coalesce(s.settings -> 'staffLogin', '{}'::jsonb) as l
        from public.shops s where s.id = p_shop) x
$$;

-- ---------------------------------------------------------------------------
-- Edge function side (service role only)
-- ---------------------------------------------------------------------------
create function public.phone_lookup(p_phone text)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select private.staff_by_phone(p_phone) $$;

-- The first PIN (or a new one after the shop reset it): links the sign-in, saves the PIN and
-- binds the phone. Refused once a PIN is set, or from another phone than the bound one.
create function public.pin_setup(p_phone text, p_pin text, p_device text, p_auth_user uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r jsonb;
  p public.people;
  st public.staff;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;
  if p_device is null or length(trim(p_device)) < 8 or p_auth_user is null then
    raise exception 'A device id and a sign-in are required' using errcode = 'check_violation';
  end if;
  r := private.staff_by_phone(p_phone);
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  select * into p from public.people where id = (r ->> 'personId')::uuid for update;
  select * into st from public.staff where person_id = p.id for update;
  if exists (select 1 from public.pin_credentials c where c.person_id = p.id) then
    return jsonb_build_object('ok', false, 'reason', 'has_pin');
  end if;
  if st.device_id is not null and st.device_id is distinct from p_device then
    return jsonb_build_object('ok', false, 'reason', 'wrong_device');
  end if;
  if p.auth_user_id is not null and p.auth_user_id <> p_auth_user then
    raise exception 'This person already has a different sign-in' using errcode = 'check_violation';
  end if;

  update public.people set auth_user_id = p_auth_user where id = p.id;
  insert into public.pin_credentials (person_id, shop_id, pin_hash)
  values (p.id, p.shop_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  update public.staff set device_id = p_device where person_id = p.id;
  return jsonb_build_object('ok', true, 'personId', p.id, 'shopId', p.shop_id);
end;
$$;

-- Same attempt rules as before; a person whose PIN the shop reset gets `no_pin` (set a new one)
-- once the phone and staff checks pass.
create or replace function private.pin_login_at(
  p_person uuid, p_pin text, p_device text, p_now timestamptz
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.pin_credentials;
  st public.staff;
  p public.people;
  s jsonb;
  failed int;
begin
  select * into p from public.people where id = p_person;
  if p.id is null or p.auth_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login');
  end if;
  select * into st from public.staff where person_id = p_person;
  if st.person_id is not null and st.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'left');
  end if;
  if st.device_id is not null and st.device_id is distinct from p_device then
    return jsonb_build_object('ok', false, 'reason', 'wrong_device');
  end if;
  select * into c from public.pin_credentials where person_id = p_person for update;
  if c.person_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  s := private.login_settings(c.shop_id);
  if c.locked then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if c.wait_until is not null and p_now < c.wait_until then
    return jsonb_build_object('ok', false, 'reason', 'wait', 'retryAt', c.wait_until);
  end if;

  if c.pin_hash = extensions.crypt(coalesce(p_pin, ''), c.pin_hash) then
    update public.pin_credentials
    set failed_attempts = 0, wait_until = null, locked = false, updated_at = p_now
    where person_id = p_person;
    if st.person_id is not null and st.device_id is null and p_device is not null then
      update public.staff set device_id = p_device where person_id = p_person;
    end if;
    return jsonb_build_object('ok', true, 'authUserId', p.auth_user_id, 'shopId', c.shop_id);
  end if;

  failed := c.failed_attempts + 1;
  if failed >= (s ->> 'wrongPinsBeforeLock')::int then
    update public.pin_credentials
    set failed_attempts = failed, wait_until = null, locked = true, updated_at = p_now
    where person_id = p_person;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  elsif failed % (s ->> 'wrongPinsBeforeWait')::int = 0 then
    update public.pin_credentials
    set failed_attempts = failed,
        wait_until = p_now + make_interval(mins => (s ->> 'pinWaitMinutes')::int),
        updated_at = p_now
    where person_id = p_person
    returning * into c;
    return jsonb_build_object('ok', false, 'reason', 'wait', 'retryAt', c.wait_until);
  end if;
  update public.pin_credentials set failed_attempts = failed, wait_until = null, updated_at = p_now
  where person_id = p_person;
  return jsonb_build_object('ok', false, 'reason', 'wrong_pin',
    'triesLeft', (s ->> 'wrongPinsBeforeWait')::int - failed % (s ->> 'wrongPinsBeforeWait')::int);
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner side (staff.edit)
-- ---------------------------------------------------------------------------
create function public.reset_pin(p_person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_shop uuid := (select shop_id from public.people where id = p_person);
begin
  if v_shop is null or not private.has_permission(v_shop, 'staff.edit') then
    raise exception 'Not allowed to change this login' using errcode = 'insufficient_privilege';
  end if;
  delete from public.pin_credentials where person_id = p_person;
end;
$$;

-- Everyone's sign-in state in a shop: PIN set, waiting / locked, phone bound.
drop function public.staff_logins(uuid);
create function public.staff_logins(p_shop uuid)
returns table (
  person_id uuid, has_pin boolean, locked boolean, wait_until timestamptz, phone_bound boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_permission(p_shop, 'staff.edit') then
    raise exception 'Not allowed to see logins' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id,
           c.person_id is not null,
           coalesce(c.locked, false),
           case when c.wait_until > now() then c.wait_until end,
           s.device_id is not null
    from public.people p
    left join public.pin_credentials c on c.person_id = p.id
    left join public.staff s on s.person_id = p.id
    where p.shop_id = p_shop and not p.is_owner;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite links removed
-- ---------------------------------------------------------------------------
drop function public.create_invite(uuid);
drop function public.revoke_invite(uuid);
drop function public.invite_lookup(text);
drop function public.invite_accept(text, text, text, uuid);
drop table public.invites;
drop function private.token_hash(text);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- phone_key is pure and runs in the people index whenever staff are saved, so signed-in users
-- need it; the private schema isn't exposed through the API.
revoke all on function private.phone_key(text) from public, anon;
grant execute on function private.phone_key(text) to authenticated, service_role;
revoke all on function private.staff_by_phone(text) from public, anon, authenticated;
grant execute on function private.staff_by_phone(text) to service_role;

revoke all on function public.phone_lookup(text), public.pin_setup(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phone_lookup(text), public.pin_setup(text, text, text, uuid)
  to service_role;

revoke all on function public.reset_pin(uuid), public.staff_logins(uuid) from public, anon;
grant execute on function public.reset_pin(uuid), public.staff_logins(uuid) to authenticated;
