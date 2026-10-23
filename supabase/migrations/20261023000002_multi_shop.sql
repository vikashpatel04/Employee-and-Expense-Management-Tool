-- Multi-shop (docs/DECISIONS.md 2026-10-23 "Multi-shop").
--
-- One login can belong to several shops: a `people` row per shop, each with its own name,
-- roles and owner flag. Every check is now "in THIS shop": helpers take a shop id, and every
-- policy passes the row's shop_id. Nothing depends on a "current shop" in the database; the
-- apps choose which shop to show.
--
-- Also folds in the advisor's performance notes: write policies no longer overlap read
-- policies (no "for all"), and foreign keys used by policies get indexes.

-- ---------------------------------------------------------------------------
-- Membership: one people row per (shop, login)
-- ---------------------------------------------------------------------------
alter table public.people drop constraint people_auth_user_id_key;
create unique index people_shop_login_unique on public.people (shop_id, auth_user_id)
  where auth_user_id is not null;
create index people_auth_user_id_idx on public.people (auth_user_id);

-- ---------------------------------------------------------------------------
-- Shop-scoped helpers (private schema: not on the API)
-- ---------------------------------------------------------------------------
create function private.person_id(p_shop uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.people p where p.shop_id = p_shop and p.auth_user_id = auth.uid()
$$;

create function private.is_member(p_shop uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.people p where p.shop_id = p_shop and p.auth_user_id = auth.uid())
$$;

create function private.is_owner(p_shop uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.people p
    where p.shop_id = p_shop and p.auth_user_id = auth.uid() and p.is_owner
  )
$$;

-- The owner of a shop has every permission in it; others need it through a role in that shop.
create function private.has_permission(p_shop uuid, p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_owner(p_shop) or exists (
    select 1
    from public.people p
    join public.person_roles pr on pr.person_id = p.id
    join public.role_permissions rp on rp.role_id = pr.role_id
    where p.shop_id = p_shop
      and p.auth_user_id = auth.uid()
      and rp.permission_key = p_key
  )
$$;

-- ---------------------------------------------------------------------------
-- Policies: drop the single-shop ones, recreate shop-scoped
-- ---------------------------------------------------------------------------
drop policy shops_read on public.shops;
drop policy shops_update on public.shops;
drop policy people_read on public.people;
drop policy people_insert on public.people;
drop policy people_update on public.people;
drop policy people_delete on public.people;
drop policy roles_read on public.roles;
drop policy roles_write on public.roles;
drop policy role_permissions_read on public.role_permissions;
drop policy role_permissions_write on public.role_permissions;
drop policy person_roles_read on public.person_roles;
drop policy person_roles_write on public.person_roles;
drop policy audit_log_read on public.audit_log;

-- shops: members read; settings.shop updates
create policy shops_read on public.shops
  for select to authenticated using (private.is_member(id));
create policy shops_update on public.shops
  for update to authenticated
  using (private.has_permission(id, 'settings.shop'))
  with check (private.has_permission(id, 'settings.shop'));

-- people: your own record in each shop; staff.view sees that shop; staff.edit writes
create policy people_read on public.people
  for select to authenticated
  using (auth_user_id = auth.uid() or private.has_permission(shop_id, 'staff.view'));
create policy people_insert on public.people
  for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy people_update on public.people
  for update to authenticated
  using (private.has_permission(shop_id, 'staff.edit'))
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy people_delete on public.people
  for delete to authenticated
  using (private.has_permission(shop_id, 'staff.edit'));

-- roles / role_permissions / person_roles: your own roles; settings.roles sees and writes all
create policy roles_read on public.roles
  for select to authenticated
  using (
    private.has_permission(shop_id, 'settings.roles')
    or exists (select 1 from public.person_roles pr
               where pr.role_id = roles.id and pr.person_id = private.person_id(roles.shop_id))
  );
create policy roles_insert on public.roles
  for insert to authenticated with check (private.has_permission(shop_id, 'settings.roles'));
create policy roles_update on public.roles
  for update to authenticated
  using (private.has_permission(shop_id, 'settings.roles'))
  with check (private.has_permission(shop_id, 'settings.roles'));
create policy roles_delete on public.roles
  for delete to authenticated using (private.has_permission(shop_id, 'settings.roles'));

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (
    private.has_permission(shop_id, 'settings.roles')
    or exists (select 1 from public.person_roles pr
               where pr.role_id = role_permissions.role_id
                 and pr.person_id = private.person_id(role_permissions.shop_id))
  );
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated with check (private.has_permission(shop_id, 'settings.roles'));
create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (private.has_permission(shop_id, 'settings.roles'))
  with check (private.has_permission(shop_id, 'settings.roles'));
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated using (private.has_permission(shop_id, 'settings.roles'));

create policy person_roles_read on public.person_roles
  for select to authenticated
  using (
    person_id = private.person_id(shop_id)
    or private.has_permission(shop_id, 'settings.roles')
  );
create policy person_roles_insert on public.person_roles
  for insert to authenticated with check (private.has_permission(shop_id, 'settings.roles'));
create policy person_roles_update on public.person_roles
  for update to authenticated
  using (private.has_permission(shop_id, 'settings.roles'))
  with check (private.has_permission(shop_id, 'settings.roles'));
create policy person_roles_delete on public.person_roles
  for delete to authenticated using (private.has_permission(shop_id, 'settings.roles'));

-- audit log: that shop's owner
create policy audit_log_read on public.audit_log
  for select to authenticated using (private.is_owner(shop_id));

-- ---------------------------------------------------------------------------
-- Functions that used the single-shop helpers
-- ---------------------------------------------------------------------------
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
    if old.is_owner and new.auth_user_id is distinct from old.auth_user_id
       and not private.is_owner(old.shop_id) then
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
  row_shop uuid := coalesce((rec ->> 'shop_id')::uuid,
                            case when tg_table_name = 'shops' then (rec ->> 'id')::uuid end);
begin
  insert into public.audit_log (shop_id, actor_id, table_name, row_id, action, before, after)
  values (
    row_shop,
    private.person_id(row_shop),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'role_id' || ':' || coalesce(rec ->> 'permission_key', rec ->> 'person_id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Permissions of the signed-in person IN ONE SHOP, for the apps to show/hide UI.
drop function public.my_permissions();
create function public.my_permissions(p_shop uuid)
returns setof text
language sql stable security definer set search_path = ''
as $$
  select k.key from public.permissions k where private.has_permission(p_shop, k.key)
$$;

-- Creating a shop: the first one on a fresh install (first-run setup), or another one by
-- someone who already owns a shop. The caller becomes the new shop's owner.
drop function public.setup_shop(text, text);
create function public.create_shop(shop_name text, owner_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_shop uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  -- serialise concurrent creates so two first-run setups can't both succeed
  lock table public.shops in exclusive mode;
  if exists (select 1 from public.shops)
     and not exists (select 1 from public.people p where p.auth_user_id = auth.uid() and p.is_owner) then
    raise exception 'Only a shop owner can add another shop' using errcode = 'insufficient_privilege';
  end if;

  insert into public.shops (name) values (shop_name) returning id into new_shop;

  perform set_config('fincrew.bootstrap', 'on', true);
  insert into public.people (shop_id, auth_user_id, name, is_owner)
  values (new_shop, auth.uid(), owner_name, true);
  perform set_config('fincrew.bootstrap', 'off', true);

  return new_shop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Old single-shop helpers are no longer used by anything
-- ---------------------------------------------------------------------------
drop function private.has_permission(text);
drop function private.is_owner();
drop function private.current_shop_id();
drop function private.current_person_id();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.person_id(uuid), private.is_member(uuid), private.is_owner(uuid),
  private.has_permission(uuid, text) from public, anon;
grant execute on function private.person_id(uuid), private.is_member(uuid), private.is_owner(uuid),
  private.has_permission(uuid, text) to authenticated, service_role;

revoke all on function public.my_permissions(uuid), public.create_shop(text, text) from public, anon;
grant execute on function public.my_permissions(uuid), public.create_shop(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for foreign keys used in policies and joins (advisor: unindexed_foreign_keys)
-- ---------------------------------------------------------------------------
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index person_roles_role_id_idx on public.person_roles (role_id);
create index person_roles_shop_id_idx on public.person_roles (shop_id);
create index role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index role_permissions_shop_id_idx on public.role_permissions (shop_id);
