-- Foundation: shops, people, roles & permissions, audit log, RLS helpers.
-- docs/PLAN.md §3 (roles and permissions), §5 (data model), §9 (working rules).
--
-- Conventions:
--   * every table has shop_id (fork-friendly) and RLS on
--   * helpers are SECURITY DEFINER with an empty search_path, so policies can call
--     them without recursive RLS checks
--   * append-only tables reject UPDATE/DELETE with a trigger (not just a policy)

-- ---------------------------------------------------------------------------
-- Permission catalogue (keys mirror packages/core/src/permissions.ts)
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key,
  area text not null,
  description text not null
);

insert into public.permissions (key, area, description) values
  ('staff.view',               'staff',      'View staff list'),
  ('staff.edit',               'staff',      'Add and edit staff'),
  ('staff.pay.view',           'staff',      'View pay settings'),
  ('staff.pay.edit',           'staff',      'Edit pay settings'),
  ('attendance.mark',          'attendance', 'Mark attendance for others'),
  ('attendance.edit_past',     'attendance', 'Edit past days'),
  ('attendance.code',          'attendance', 'View and regenerate attendance code'),
  ('requests.decide',          'requests',   'Approve or reject leave and advance requests'),
  ('advances.give',            'advances',   'Give advances'),
  ('salary.view',              'salary',     'View salary'),
  ('salary.run',               'salary',     'Run and pay salary'),
  ('salary.undo_payment',      'salary',     'Undo a salary payment'),
  ('expenses.add',             'expenses',   'Add expenses'),
  ('expenses.view_all',        'expenses',   'View all expenses'),
  ('expenses.edit',            'expenses',   'Edit and delete expenses'),
  ('expenses.categories',      'expenses',   'Manage expense categories'),
  ('reports.view',             'reports',    'View reports'),
  ('reports.export',           'reports',    'Export reports'),
  ('settings.leave_templates', 'settings',   'Manage leave templates'),
  ('settings.attendance',      'settings',   'Manage attendance and late rules'),
  ('settings.roles',           'settings',   'Manage roles and permissions'),
  ('settings.shop',            'settings',   'Manage shop settings');

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete restrict,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  phone text,
  photo_path text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);
create index people_shop_id_idx on public.people (shop_id);
-- exactly one owner per shop
create unique index people_one_owner_per_shop on public.people (shop_id) where is_owner;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key),
  shop_id uuid not null references public.shops (id) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.person_roles (
  person_id uuid not null references public.people (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  primary key (person_id, role_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  shop_id uuid references public.shops (id) on delete cascade,
  actor_id uuid references public.people (id) on delete set null,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_shop_at_idx on public.audit_log (shop_id, at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_person_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.people p where p.auth_user_id = auth.uid()
$$;

create or replace function public.current_shop_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.shop_id from public.people p where p.auth_user_id = auth.uid()
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_owner from public.people p where p.auth_user_id = auth.uid()),
    false
  )
$$;

-- The owner always has every permission; everyone else needs it through a role.
create or replace function public.has_permission(permission_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_owner() or exists (
    select 1
    from public.people p
    join public.person_roles pr on pr.person_id = p.id
    join public.role_permissions rp on rp.role_id = pr.role_id
    where p.auth_user_id = auth.uid()
      and rp.permission_key = has_permission.permission_key
  )
$$;

-- Permissions of the signed-in person, for the apps to show/hide UI.
create or replace function public.my_permissions()
returns setof text
language sql stable security definer set search_path = ''
as $$
  select k.key from public.permissions k where public.has_permission(k.key)
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Generic: block UPDATE/DELETE on append-only tables.
create or replace function public.reject_modification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.reject_modification();

-- Owner can't be removed, demoted, or moved to another shop; nobody else can be promoted.
create or replace function public.protect_owner()
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
       and not public.is_owner() then
      raise exception 'Only the owner can change the owner login' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'INSERT' and new.is_owner and current_setting('fincrew.bootstrap', true) is distinct from 'on' then
    raise exception 'Owners are created only by shop setup' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger people_protect_owner
  before insert or update or delete on public.people
  for each row execute function public.protect_owner();

-- Role links must stay inside one shop.
create or replace function public.check_same_shop()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  role_shop uuid;
  person_shop uuid;
begin
  select r.shop_id into role_shop from public.roles r where r.id = new.role_id;
  if role_shop is distinct from new.shop_id then
    raise exception 'Role belongs to a different shop';
  end if;
  if tg_table_name = 'person_roles' then
    select p.shop_id into person_shop from public.people p where p.id = new.person_id;
    if person_shop is distinct from new.shop_id then
      raise exception 'Person belongs to a different shop';
    end if;
  end if;
  return new;
end;
$$;

create trigger role_permissions_same_shop
  before insert or update on public.role_permissions
  for each row execute function public.check_same_shop();
create trigger person_roles_same_shop
  before insert or update on public.person_roles
  for each row execute function public.check_same_shop();

-- ---------------------------------------------------------------------------
-- Audit trigger (writes as definer; users can't insert into audit_log directly)
-- ---------------------------------------------------------------------------
create or replace function public.write_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (shop_id, actor_id, table_name, row_id, action, before, after)
  values (
    coalesce((rec ->> 'shop_id')::uuid, case when tg_table_name = 'shops' then (rec ->> 'id')::uuid end),
    public.current_person_id(),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'role_id' || ':' || coalesce(rec ->> 'permission_key', rec ->> 'person_id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger shops_audit after insert or update or delete on public.shops
  for each row execute function public.write_audit();
create trigger people_audit after insert or update or delete on public.people
  for each row execute function public.write_audit();
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.write_audit();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.write_audit();
create trigger person_roles_audit after insert or update or delete on public.person_roles
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Shop setup: the first signed-in user creates the shop and becomes owner.
-- Only works while no shop exists (single-shop install). Also disable public
-- sign-ups in Supabase Auth settings (docs/SETUP.md).
-- ---------------------------------------------------------------------------
create or replace function public.setup_shop(shop_name text, owner_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_shop uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  -- serialise concurrent setups
  lock table public.shops in exclusive mode;
  if exists (select 1 from public.shops) then
    raise exception 'Shop is already set up' using errcode = 'insufficient_privilege';
  end if;

  insert into public.shops (name) values (shop_name) returning id into new_shop;

  perform set_config('fincrew.bootstrap', 'on', true);
  insert into public.people (shop_id, auth_user_id, name, is_owner)
  values (new_shop, auth.uid(), owner_name, true);
  perform set_config('fincrew.bootstrap', 'off', true);

  return new_shop;
end;
$$;

revoke execute on function public.setup_shop(text, text) from public, anon;
grant execute on function public.setup_shop(text, text) to authenticated;

-- Lets a signed-in user with no person record tell "first run" from "no access".
create or replace function public.shop_exists()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.shops)
$$;

revoke execute on function public.shop_exists() from public, anon;
grant execute on function public.shop_exists() to authenticated;

-- Keep-awake target for .github/workflows/keep-awake.yml (free projects pause
-- after 7 idle days). Touches the database, reveals nothing.
create or replace function public.ping()
returns timestamptz
language sql stable
as $$ select now() $$;

grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.permissions enable row level security;
alter table public.shops enable row level security;
alter table public.people enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.person_roles enable row level security;
alter table public.audit_log enable row level security;

-- permissions: readable catalogue, never written by users
create policy permissions_read on public.permissions
  for select to authenticated using (true);

-- shops
create policy shops_read on public.shops
  for select to authenticated using (id = public.current_shop_id());
create policy shops_update on public.shops
  for update to authenticated
  using (id = public.current_shop_id() and public.has_permission('settings.shop'))
  with check (id = public.current_shop_id());

-- people: everyone sees themselves; staff.view sees the shop
create policy people_read on public.people
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (id = public.current_person_id() or public.has_permission('staff.view'))
  );
create policy people_insert on public.people
  for insert to authenticated
  with check (shop_id = public.current_shop_id() and public.has_permission('staff.edit'));
create policy people_update on public.people
  for update to authenticated
  using (shop_id = public.current_shop_id() and public.has_permission('staff.edit'))
  with check (shop_id = public.current_shop_id());
create policy people_delete on public.people
  for delete to authenticated
  using (shop_id = public.current_shop_id() and public.has_permission('staff.edit'));

-- roles / role_permissions / person_roles
create policy roles_read on public.roles
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (
      public.has_permission('settings.roles')
      or exists (select 1 from public.person_roles pr
                 where pr.role_id = roles.id and pr.person_id = public.current_person_id())
    )
  );
create policy roles_write on public.roles
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.has_permission('settings.roles'))
  with check (shop_id = public.current_shop_id() and public.has_permission('settings.roles'));

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (
      public.has_permission('settings.roles')
      or exists (select 1 from public.person_roles pr
                 where pr.role_id = role_permissions.role_id
                   and pr.person_id = public.current_person_id())
    )
  );
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.has_permission('settings.roles'))
  with check (shop_id = public.current_shop_id() and public.has_permission('settings.roles'));

create policy person_roles_read on public.person_roles
  for select to authenticated
  using (
    shop_id = public.current_shop_id()
    and (person_id = public.current_person_id() or public.has_permission('settings.roles'))
  );
create policy person_roles_write on public.person_roles
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.has_permission('settings.roles'))
  with check (shop_id = public.current_shop_id() and public.has_permission('settings.roles'));

-- audit log: owner reads; nobody writes directly (trigger writes as definer)
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (shop_id = public.current_shop_id() and public.is_owner());

-- Anonymous users get nothing from these tables.
revoke all on public.permissions, public.shops, public.people, public.roles,
  public.role_permissions, public.person_roles, public.audit_log from anon;
revoke insert, update, delete on public.audit_log, public.permissions from authenticated;
