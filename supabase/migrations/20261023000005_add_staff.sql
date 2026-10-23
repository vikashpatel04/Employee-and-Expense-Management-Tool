-- Adding a staff member writes a person and a staff row; do both in one transaction.
-- SECURITY INVOKER: the caller's RLS applies (needs staff.edit in that shop), so this adds
-- no new permission paths.
create function public.add_staff(p_shop uuid, p_name text, p_phone text, p_joining_date date)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  new_person uuid;
begin
  if p_joining_date is null then
    raise exception 'Joining date is required' using errcode = 'check_violation';
  end if;
  insert into public.people (shop_id, name, phone)
  values (p_shop, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''))
  returning id into new_person;
  insert into public.staff (shop_id, person_id, joining_date)
  values (p_shop, new_person, p_joining_date);
  return new_person;
end;
$$;

revoke all on function public.add_staff(uuid, text, text, date) from public, anon;
grant execute on function public.add_staff(uuid, text, text, date) to authenticated;
