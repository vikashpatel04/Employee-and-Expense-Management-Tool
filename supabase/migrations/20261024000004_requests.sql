-- Phase 7: leave and advance requests from staff (docs/PLAN.md §6.1, §6.3).
--
--   * Staff ask for leave (dates) or an advance (amount) for themselves; the request starts
--     pending. They can cancel their own pending request.
--   * People with `requests.decide` approve or reject a pending one. Approving does the work
--     in the apps through the shared code (`@fincrew/data` decideRequest): leave days are marked
--     (paid or unpaid leave, paid leave within the balance) and an advance is given (the limit
--     check applies); the request then records how it was approved.
--   * Only the status and decision fields change after a request is made; nothing is deleted.

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  kind text not null check (kind in ('leave', 'advance')),
  from_date date,
  to_date date,
  amount_paise bigint check (amount_paise > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  -- How an approved leave was marked, and the advance an approved advance request gave.
  leave_status text check (leave_status in ('paid_leave', 'unpaid_leave')),
  advance_id uuid references public.advances (id),
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, decided_by) references public.people (shop_id, id) on delete set null (decided_by),
  check (
    (kind = 'leave' and from_date is not null and to_date is not null and to_date >= from_date
       and to_date - from_date < 62 and amount_paise is null)
    or (kind = 'advance' and amount_paise is not null and from_date is null and to_date is null)
  ),
  check (leave_status is null or (kind = 'leave' and status = 'approved')),
  check (advance_id is null or (kind = 'advance' and status = 'approved')),
  check ((status = 'pending') = (decided_at is null))
);
create index requests_shop_status_idx on public.requests (shop_id, status, created_at desc);
create index requests_staff_idx on public.requests (shop_id, staff_id, created_at desc);
create index requests_decided_by_idx on public.requests (shop_id, decided_by);
create index requests_advance_idx on public.requests (advance_id);

-- New requests: pending, undecided, and only for an active staff member.
-- Changes: only pending → cancelled (by the person themselves) or → approved / rejected (by
-- someone with requests.decide); the request itself never changes; the decision is stamped.
create function private.guard_request()
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
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.leave_status := null;
    new.advance_id := null;
    new.created_at := now();
    return new;
  end if;

  if old.status <> 'pending' then
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

create trigger requests_guard before insert or update on public.requests
  for each row execute function private.guard_request();
create trigger requests_no_delete before delete on public.requests
  for each row execute function private.reject_modification();
create trigger requests_audit after insert or update on public.requests
  for each row execute function private.write_audit();

alter table public.requests enable row level security;

create policy requests_read on public.requests for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'requests.decide'));
create policy requests_insert on public.requests for insert to authenticated
  with check (private.is_self(staff_id));
create policy requests_update on public.requests for update to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'requests.decide'))
  with check (private.is_self(staff_id) or private.has_permission(shop_id, 'requests.decide'));

revoke all on public.requests from anon;
revoke delete on public.requests from authenticated;
revoke all on function private.guard_request() from public, anon, authenticated;
