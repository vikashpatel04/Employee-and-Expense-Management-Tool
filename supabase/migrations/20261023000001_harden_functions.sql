-- Hardening after the first Supabase security-advisor run (docs/DECISIONS.md, 2026-10-23).
--
-- 1. Internal helpers and trigger functions move to a `private` schema, which PostgREST does not
--    expose, so they are no longer callable at /rest/v1/rpc/*. RLS policies reference functions
--    by OID, so they keep working after ALTER FUNCTION ... SET SCHEMA. Function bodies refer to
--    each other by name, so the ones that call a moved function are recreated below.
-- 2. Anonymous users can execute only ping(). Signed-in users keep what the app calls:
--    my_permissions(), setup_shop(), shop_exists(), plus the private helpers the policies need.
-- 3. Future functions are no longer executable by PUBLIC/anon by default; grant explicitly.
-- 4. ping() gets a fixed search_path.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.current_person_id() set schema private;
alter function public.current_shop_id() set schema private;
alter function public.is_owner() set schema private;
alter function public.has_permission(text) set schema private;
alter function public.reject_modification() set schema private;
alter function public.protect_owner() set schema private;
alter function public.check_same_shop() set schema private;
alter function public.write_audit() set schema private;

-- Bodies that referenced public.<moved function> ------------------------------------------

create or replace function private.has_permission(permission_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_owner() or exists (
    select 1
    from public.people p
    join public.person_roles pr on pr.person_id = p.id
    join public.role_permissions rp on rp.role_id = pr.role_id
    where p.auth_user_id = auth.uid()
      and rp.permission_key = has_permission.permission_key
  )
$$;

create or replace function public.my_permissions()
returns setof text
language sql stable security definer set search_path = ''
as $$
  select k.key from public.permissions k where private.has_permission(k.key)
$$;

create or replace function private.protect_owner()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception 'The owner cannot be removed' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_owner is distinct from old.is_owner then
      raise exception 'Ownership cannot be changed' using errcode = 'insufficient_privilege';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'A person cannot move between shops' using errcode = 'insufficient_privilege';
    end if;
    -- Only the owner may change their own login link.
    if old.is_owner and new.auth_user_id is distinct from old.auth_user_id
       and not private.is_owner() then
      raise exception 'Only the owner can change the owner login' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'INSERT' and new.is_owner and current_setting('fincrew.bootstrap', true) is distinct from 'on' then
    raise exception 'Owners are created only by shop setup' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function private.write_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (shop_id, actor_id, table_name, row_id, action, before, after)
  values (
    coalesce((rec ->> 'shop_id')::uuid, case when tg_table_name = 'shops' then (rec ->> 'id')::uuid end),
    private.current_person_id(),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'role_id' || ':' || coalesce(rec ->> 'permission_key', rec ->> 'person_id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

alter function public.ping() set search_path = '';

-- Execute grants ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
-- RLS policies run as the signed-in user, so these must stay executable for `authenticated`.
grant execute on function private.current_person_id(), private.current_shop_id(),
  private.is_owner(), private.has_permission(text) to authenticated, service_role;

revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;
-- setup_shop / shop_exists were already revoked from anon in the foundation migration.

-- Future functions: nobody but the owner by default; grant per function in its migration.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
