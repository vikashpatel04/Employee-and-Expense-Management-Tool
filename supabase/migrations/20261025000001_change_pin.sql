-- Staffora → Me → Change PIN. A signed-in staff member sets a new 4-digit PIN by giving the
-- current one on their own phone. The current PIN is checked exactly like a sign-in
-- (`private.pin_login_at`): another phone or a person who has left is refused, and a wrong PIN
-- counts towards the same wait / lock (shops.settings.staffLogin), so an unlocked phone can't be
-- used to guess it. Replies: { ok } or { ok: false, reason, retryAt?, triesLeft? } with reasons
-- bad_pin | same_pin | wrong_pin | wait | locked | wrong_device | left | no_login.

create function public.change_pin(p_person uuid, p_current text, p_new text, p_device text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r jsonb;
begin
  if not private.is_self(p_person) then
    raise exception 'Not allowed to change this PIN' using errcode = 'insufficient_privilege';
  end if;
  if p_new is null or p_new !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_pin');
  end if;

  r := private.pin_login_at(p_person, p_current, p_device, now());
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  if p_new = p_current then
    return jsonb_build_object('ok', false, 'reason', 'same_pin');
  end if;

  update public.pin_credentials
  set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), updated_at = now()
  where person_id = p_person;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.change_pin(uuid, text, text, text) from public, anon;
grant execute on function public.change_pin(uuid, text, text, text) to authenticated;
