-- Phase 7: staff sign in with an invite link and a 4-digit PIN (docs/PLAN.md §1, §10).
--
--   * Someone with `staff.edit` makes an invite for a person (not the owner): a random token
--     that works once, for shops.settings.staffLogin.inviteHours (default 48). Only its SHA-256
--     is stored; making a new one cancels the person's unused ones.
--   * The `staff-auth` edge function (service role) opens the invite, creates or reuses the
--     person's sign-in, saves their PIN (bcrypt) and binds their phone (`invite_accept`), and
--     later checks the PIN on each sign-in (`pin_login`). The rules mirror core
--     `evaluatePinAttempt`: wrong PINs count, a wait after every `wrongPinsBeforeWait`, a lock
--     at `wrongPinsBeforeLock` that only `staff.edit` can lift. A test compares both.
--   * PINs and tokens are never readable through the API.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  person_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, person_id) references public.people (shop_id, id) on delete cascade,
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by)
);
create index invites_person_idx on public.invites (shop_id, person_id, created_at desc);
create index invites_created_by_idx on public.invites (shop_id, created_by);

create table public.pin_credentials (
  person_id uuid primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  wait_until timestamptz,
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key (shop_id, person_id) references public.people (shop_id, id) on delete cascade
);
create index pin_credentials_shop_idx on public.pin_credentials (shop_id);

alter table public.invites enable row level security;
alter table public.pin_credentials enable row level security;

-- Invites: people with staff.edit see when they were made / used (never the token hash).
create policy invites_read on public.invites for select to authenticated
  using (private.has_permission(shop_id, 'staff.edit'));
revoke all on public.invites from anon, authenticated;
grant select (id, shop_id, person_id, expires_at, used_at, revoked_at, created_by, created_at)
  on public.invites to authenticated;

-- PINs: nobody through the API.
revoke all on public.pin_credentials from anon, authenticated;

create trigger invites_audit after insert or update or delete on public.invites
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- shops.settings.staffLogin with the core defaults (DEFAULT_STAFF_LOGIN) filled in.
create function private.login_settings(p_shop uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'inviteHours', coalesce((l ->> 'inviteHours')::int, 48),
    'wrongPinsBeforeWait', coalesce((l ->> 'wrongPinsBeforeWait')::int, 5),
    'pinWaitMinutes', coalesce((l ->> 'pinWaitMinutes')::int, 15),
    'wrongPinsBeforeLock', coalesce((l ->> 'wrongPinsBeforeLock')::int, 10)
  )
  from (select coalesce(s.settings -> 'staffLogin', '{}'::jsonb) as l
        from public.shops s where s.id = p_shop) x
$$;

create function private.token_hash(p_token text)
returns text
language sql immutable set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

-- ---------------------------------------------------------------------------
-- Owner side (staff.edit): invite, see login state, unlock, reset the phone
-- ---------------------------------------------------------------------------
create function public.create_invite(p_person uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  p public.people;
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  inv public.invites;
begin
  select * into p from public.people where id = p_person;
  if p.id is null or not private.has_permission(p.shop_id, 'staff.edit') then
    raise exception 'Not allowed to invite this person' using errcode = 'insufficient_privilege';
  end if;
  if p.is_owner then
    raise exception 'The owner signs in with email' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.staff s where s.person_id = p.id and s.status <> 'active') then
    raise exception 'This person has left' using errcode = 'check_violation';
  end if;
  update public.invites set revoked_at = now()
  where person_id = p.id and used_at is null and revoked_at is null;
  insert into public.invites (shop_id, person_id, token_hash, expires_at, created_by)
  values (p.shop_id, p.id, private.token_hash(token),
          now() + make_interval(hours => (private.login_settings(p.shop_id) ->> 'inviteHours')::int),
          private.person_id(p.shop_id))
  returning * into inv;
  return jsonb_build_object('token', token, 'expiresAt', inv.expires_at);
end;
$$;

create function public.revoke_invite(p_person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_shop uuid := (select shop_id from public.people where id = p_person);
begin
  if v_shop is null or not private.has_permission(v_shop, 'staff.edit') then
    raise exception 'Not allowed to change this login' using errcode = 'insufficient_privilege';
  end if;
  update public.invites set revoked_at = now()
  where person_id = p_person and used_at is null and revoked_at is null;
end;
$$;

-- Everyone's sign-in state in a shop: PIN set, waiting / locked, open invite, phone bound.
create function public.staff_logins(p_shop uuid)
returns table (
  person_id uuid, has_pin boolean, locked boolean, wait_until timestamptz,
  invite_expires_at timestamptz, phone_bound boolean
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
           (select max(i.expires_at) from public.invites i
            where i.person_id = p.id and i.used_at is null and i.revoked_at is null
              and i.expires_at > now()),
           s.device_id is not null
    from public.people p
    left join public.pin_credentials c on c.person_id = p.id
    left join public.staff s on s.person_id = p.id
    where p.shop_id = p_shop and not p.is_owner;
end;
$$;

create function public.unlock_login(p_person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_shop uuid := (select shop_id from public.people where id = p_person);
begin
  if v_shop is null or not private.has_permission(v_shop, 'staff.edit') then
    raise exception 'Not allowed to change this login' using errcode = 'insufficient_privilege';
  end if;
  update public.pin_credentials
  set failed_attempts = 0, wait_until = null, locked = false, updated_at = now()
  where person_id = p_person;
end;
$$;

create function public.reset_staff_phone(p_person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_shop uuid := (select shop_id from public.people where id = p_person);
begin
  if v_shop is null or not private.has_permission(v_shop, 'staff.edit') then
    raise exception 'Not allowed to change this login' using errcode = 'insufficient_privilege';
  end if;
  update public.staff set device_id = null where person_id = p_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- Edge function side (service role only)
-- ---------------------------------------------------------------------------

-- The open invite behind a token: who it is for, or why it can't be used.
create function public.invite_lookup(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  inv public.invites;
  p public.people;
begin
  select * into inv from public.invites where token_hash = private.token_hash(p_token);
  if inv.id is null or inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  elsif inv.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  elsif inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select * into p from public.people where id = inv.person_id;
  return jsonb_build_object(
    'ok', true,
    'personId', p.id,
    'shopId', p.shop_id,
    'name', p.name,
    'shopName', (select name from public.shops where id = p.shop_id),
    'authUserId', p.auth_user_id
  );
end;
$$;

-- Use the invite: link the sign-in, save the PIN, bind the phone (staff), mark it used.
create function public.invite_accept(p_token text, p_pin text, p_device text, p_auth_user uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  inv public.invites;
  p public.people;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;
  if p_device is null or length(trim(p_device)) < 8 or p_auth_user is null then
    raise exception 'A device id and a sign-in are required' using errcode = 'check_violation';
  end if;
  select * into inv from public.invites where token_hash = private.token_hash(p_token) for update;
  if inv.id is null or inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  elsif inv.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  elsif inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select * into p from public.people where id = inv.person_id for update;
  if p.auth_user_id is not null and p.auth_user_id <> p_auth_user then
    raise exception 'This person already has a different sign-in' using errcode = 'check_violation';
  end if;

  update public.people set auth_user_id = p_auth_user where id = p.id;
  insert into public.pin_credentials (person_id, shop_id, pin_hash)
  values (p.id, p.shop_id, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (person_id) do update set
    pin_hash = excluded.pin_hash, failed_attempts = 0, wait_until = null, locked = false,
    updated_at = now();
  update public.staff set device_id = p_device where person_id = p.id;
  update public.invites set used_at = now() where id = inv.id;
  return jsonb_build_object('ok', true, 'personId', p.id, 'shopId', p.shop_id);
end;
$$;

-- One PIN attempt at `p_now` (tests pass their own time). Wrong phone or a person who has left
-- is refused before the PIN is looked at (and not counted).
create function private.pin_login_at(p_person uuid, p_pin text, p_device text, p_now timestamptz)
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
  select * into c from public.pin_credentials where person_id = p_person for update;
  select * into p from public.people where id = p_person;
  if c.person_id is null or p.auth_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login');
  end if;
  select * into st from public.staff where person_id = p_person;
  if st.person_id is not null and st.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'left');
  end if;
  if st.device_id is not null and st.device_id is distinct from p_device then
    return jsonb_build_object('ok', false, 'reason', 'wrong_device');
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

create function public.pin_login(p_person uuid, p_pin text, p_device text)
returns jsonb
language sql volatile security definer set search_path = ''
as $$ select private.pin_login_at(p_person, p_pin, p_device, now()) $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.login_settings(uuid), private.token_hash(text),
  private.pin_login_at(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function private.login_settings(uuid), private.token_hash(text),
  private.pin_login_at(uuid, text, text, timestamptz) to service_role;

revoke all on function public.create_invite(uuid), public.revoke_invite(uuid),
  public.staff_logins(uuid), public.unlock_login(uuid), public.reset_staff_phone(uuid)
  from public, anon;
grant execute on function public.create_invite(uuid), public.revoke_invite(uuid),
  public.staff_logins(uuid), public.unlock_login(uuid), public.reset_staff_phone(uuid)
  to authenticated;

revoke all on function public.invite_lookup(text), public.invite_accept(text, text, text, uuid),
  public.pin_login(uuid, text, text) from public, anon, authenticated;
grant execute on function public.invite_lookup(text), public.invite_accept(text, text, text, uuid),
  public.pin_login(uuid, text, text) to service_role;
