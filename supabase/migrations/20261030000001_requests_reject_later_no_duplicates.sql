-- Owner, 30/10/2026: requests.
--
-- 1. No duplicate leave: a staff member can't ask for leave on a day that is already in one of
--    their waiting or approved leave requests, or already marked as leave.
-- 2. Reject later: someone with requests.decide can reject a request they (or anyone) approved.
--    The apps undo what the approval did first (`@fincrew/data` rejectApprovedRequest): the
--    leave marks are cleared, an advance is undone (its ledger line reversed). The database
--    checks the advance part: an approved advance request can only be rejected once its advance
--    is undone. Rejected, cancelled and waiting requests work as before.

create or replace function private.guard_request()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  adv public.advances;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.staff s
                   where s.person_id = new.staff_id and s.shop_id = new.shop_id
                     and s.status = 'active') then
      raise exception 'Only current staff can make requests' using errcode = 'check_violation';
    end if;
    if new.kind = 'leave' and new.from_date is not null and new.to_date is not null and (
      exists (select 1 from public.requests r
              where r.staff_id = new.staff_id and r.shop_id = new.shop_id and r.kind = 'leave'
                and r.status in ('pending', 'approved')
                and r.from_date <= new.to_date and r.to_date >= new.from_date)
      or exists (select 1 from public.attendance a
                 where a.staff_id = new.staff_id and a.shop_id = new.shop_id
                   and a.status in ('paid_leave', 'unpaid_leave')
                   and a.date between new.from_date and new.to_date)
    ) then
      raise exception 'Leave already asked for or marked on these days'
        using errcode = 'unique_violation';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.leave_status := null;
    new.advance_id := null;
    new.created_at := now();
    return new;
  end if;

  if not (old.status = 'pending' or (old.status = 'approved' and new.status = 'rejected')) then
    raise exception 'This request is already %', old.status using errcode = 'check_violation';
  end if;
  if (new.shop_id, new.staff_id, new.kind, new.from_date, new.to_date, new.amount_paise,
      new.note, new.created_at)
     is distinct from
     (old.shop_id, old.staff_id, old.kind, old.from_date, old.to_date, old.amount_paise,
      old.note, old.created_at) then
    raise exception 'A request can''t be changed, only decided' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' then
    if not private.is_self(old.staff_id) then
      raise exception 'Only the person who asked can cancel' using errcode = 'insufficient_privilege';
    end if;
    new.leave_status := null;
    new.advance_id := null;
  elsif new.status in ('approved', 'rejected') then
    if not private.has_permission(old.shop_id, 'requests.decide') then
      raise exception 'Not allowed to decide requests' using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'approved' and old.advance_id is not null and not exists (
      select 1
      from public.ledger_entries l
      join public.ledger_entries r on r.reverses_id = l.id
      where l.ref_table = 'advances' and l.ref_id = old.advance_id
    ) then
      raise exception 'Undo the advance before rejecting this request'
        using errcode = 'check_violation';
    end if;
    if new.status = 'rejected' then
      new.leave_status := null;
      new.advance_id := null;
    end if;
    if new.advance_id is not null then
      select * into adv from public.advances where id = new.advance_id;
      if adv.shop_id is distinct from old.shop_id or adv.staff_id is distinct from old.staff_id
         or adv.kind <> 'given' then
        raise exception 'That advance is not for this person' using errcode = 'check_violation';
      end if;
    end if;
  else
    raise exception 'A request can only be cancelled, approved or rejected'
      using errcode = 'check_violation';
  end if;
  new.decided_by := private.person_id(old.shop_id);
  new.decided_at := now();
  return new;
end;
$$;

revoke all on function private.guard_request() from public, anon, authenticated;
