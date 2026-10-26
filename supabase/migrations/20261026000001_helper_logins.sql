-- Helper sign-ins (owner's decision 2026-10-26: email + password). A helper is a person in the
-- shop with roles but no payroll (no staff row). Someone with staff.edit gives them a sign-in:
-- their email and a first password, which the helper changes at the first sign-in. The account
-- itself is made by the `helper-auth` edge function (service role); these functions hold the
-- rules. Docs: docs/features/helper-sign-in.md.

-- The email a helper signs in with, shown on the Roles page (auth.users can't be read by apps).
alter table public.people add column login_email text;

-- Only the server (edge functions, security definer functions) may change who a person signs in
-- as. Before this, a role with staff.edit could set people.auth_user_id through the API.
create function private.guard_login_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and (new.auth_user_id is distinct from old.auth_user_id
          or new.login_email is distinct from old.login_email) then
    raise exception 'Sign-ins are changed by the shop''s sign-in screens only'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger people_guard_login_link before update on public.people
  for each row execute function private.guard_login_link();

-- Called by the website / app (as the signed-in person) through the edge function, before any
-- change: may this person give or change a sign-in for p_person? Returns what the edge function
-- needs, or { ok: false, reason }: not_found, no_permission, owner, staff.
create function public.helper_login_target(p_person uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.people;
  other_shops int;
begin
  select * into p from public.people where id = p_person;
  if not found or not private.is_member(p.shop_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not private.has_permission(p.shop_id, 'staff.edit') then
    return jsonb_build_object('ok', false, 'reason', 'no_permission');
  end if;
  if p.is_owner then
    return jsonb_build_object('ok', false, 'reason', 'owner');
  end if;
  if exists (select 1 from public.staff s where s.person_id = p.id) then
    return jsonb_build_object('ok', false, 'reason', 'staff');
  end if;
  select count(*) into other_shops
  from public.people o
  where p.auth_user_id is not null and o.auth_user_id = p.auth_user_id and o.id <> p.id;
  return jsonb_build_object(
    'ok', true,
    'personId', p.id,
    'shopId', p.shop_id,
    'authUserId', p.auth_user_id,
    'email', p.login_email,
    -- the same sign-in is used in other shops: its password is the person's own business
    'otherShops', other_shops
  );
end;
$$;

-- Service role only: the sign-in with this email, if there is one.
create function public.auth_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;

-- Service role only: link (or, with null, unlink) a person's sign-in.
create function public.helper_login_link(p_person uuid, p_user uuid, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.people
  set auth_user_id = p_user, login_email = case when p_user is null then null else lower(trim(p_email)) end
  where id = p_person
$$;

revoke all on function private.guard_login_link() from public, anon, authenticated;
revoke all on function public.helper_login_target(uuid) from public, anon;
grant execute on function public.helper_login_target(uuid) to authenticated, service_role;
revoke all on function public.auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_email(text) to service_role;
revoke all on function public.helper_login_link(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.helper_login_link(uuid, uuid, text) to service_role;
