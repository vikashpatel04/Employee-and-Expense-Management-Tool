-- Phase 4.2: advances, staff ledger, salary runs, payslips, leave balances
-- (docs/PLAN.md §4.6, §4.7, §5; calculations in packages/core; docs/features/money-data.md).
--
-- Money flow:
--   * The app calculates a payslip with packages/core and saves it as a DRAFT.
--   * finalize_payslip() makes it final and posts the ledger lines FROM the payslip, so the
--     ledger always matches the payslip. A re-run (revision 2, 3…) posts only the differences
--     as `adjustment` lines; old lines are never edited.
--   * Payments, advances, reversals are ledger lines; the ledger is append-only in the database.
-- Ledger sign: positive = the shop owes the staff member.
--
-- Also folds in advisor performance notes: people_read evaluates auth.uid() once per query,
-- and composite foreign keys from Phase 4.1 get covering indexes.

-- ---------------------------------------------------------------------------
-- Advisor fixes from Phase 4.1
-- ---------------------------------------------------------------------------
drop policy people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = (select auth.uid()) or private.has_permission(shop_id, 'staff.view'));

create index attendance_shop_staff_idx on public.attendance (shop_id, staff_id);
create index attendance_shop_marked_by_idx on public.attendance (shop_id, marked_by);
create index leave_template_versions_shop_template_idx on public.leave_template_versions (shop_id, template_id);
create index pay_settings_shop_staff_idx on public.pay_settings (shop_id, staff_id);
create index staff_leave_templates_shop_staff_idx on public.staff_leave_templates (shop_id, staff_id);

-- Monthly advance cut for this person (null = decided at each salary run).
alter table public.staff add column advance_cut_paise bigint check (advance_cut_paise >= 0);

-- ---------------------------------------------------------------------------
-- Salary runs and payslips
-- ---------------------------------------------------------------------------
create table public.salary_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by),
  unique (shop_id, year, month),
  unique (shop_id, id)
);
create index salary_runs_shop_created_by_idx on public.salary_runs (shop_id, created_by);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  run_id uuid not null,
  staff_id uuid not null,
  -- 1 for the first calculation; each re-run after finalizing adds the next revision
  revision smallint not null default 1,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  -- packages/core SalaryResult: lines (kind, name, amount), day summary, warnings, leave roll
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  leave jsonb check (leave is null or jsonb_typeof(leave) = 'object'),
  gross_paise bigint not null default 0 check (gross_paise >= 0),
  deductions_paise bigint not null default 0 check (deductions_paise >= 0),
  net_before_advance_paise bigint not null default 0,
  advance_cut_paise bigint not null default 0 check (advance_cut_paise >= 0),
  net_pay_paise bigint not null default 0,
  pdf_path text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by uuid,
  foreign key (shop_id, run_id) references public.salary_runs (shop_id, id) on delete cascade,
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, finalized_by) references public.people (shop_id, id) on delete set null (finalized_by),
  unique (run_id, staff_id, revision),
  unique (shop_id, id),
  check (net_before_advance_paise = gross_paise - deductions_paise),
  check (net_pay_paise = net_before_advance_paise - advance_cut_paise)
);
create index payslips_shop_staff_idx on public.payslips (shop_id, staff_id);
create index payslips_shop_run_idx on public.payslips (shop_id, run_id);
create index payslips_shop_finalized_by_idx on public.payslips (shop_id, finalized_by);

-- Drafts are editable; finalized payslips never change (re-run with a new revision).
create function private.guard_payslip()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  latest smallint;
  all_final boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Payslips start as drafts' using errcode = 'check_violation';
    end if;
    select max(p.revision), bool_and(p.status = 'finalized') into latest, all_final
    from public.payslips p where p.run_id = new.run_id and p.staff_id = new.staff_id;
    if latest is not null and not all_final then
      raise exception 'Finalize or delete the current draft before re-running'
        using errcode = 'check_violation';
    end if;
    new.revision := coalesce(latest, 0) + 1;
    return new;
  end if;

  if old.status = 'finalized' then
    raise exception 'A finalized payslip can''t be changed; re-run the salary instead'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.run_id <> old.run_id or new.staff_id <> old.staff_id or new.revision <> old.revision
     or new.shop_id <> old.shop_id then
    raise exception 'A payslip can''t move to another run, person or revision'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'finalized' and current_setting('fincrew.finalizing', true) is distinct from 'on' then
    raise exception 'Use finalize_payslip to finalize' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger payslips_guard before insert or update or delete on public.payslips
  for each row execute function private.guard_payslip();

-- ---------------------------------------------------------------------------
-- Leave balances (one row per person per month; written when a payslip is finalized)
-- ---------------------------------------------------------------------------
create table public.leave_balances (
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  opening smallint not null default 0,
  earned smallint not null default 0,
  used smallint not null default 0,
  carried smallint not null default 0,
  paid_out smallint not null default 0,
  lapsed smallint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (staff_id, year, month),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade
);
create index leave_balances_shop_staff_idx on public.leave_balances (shop_id, staff_id);

-- ---------------------------------------------------------------------------
-- Staff ledger (append-only)
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  date date not null,
  type text not null check (type in ('opening_balance', 'salary_earned', 'salary_payment', 'advance',
    'advance_cut', 'late_deduction', 'deduction', 'reimbursement', 'staff_charge', 'adjustment', 'reversal')),
  amount_paise bigint not null check (amount_paise <> 0),
  -- allowance/deduction name
  name text,
  payment_mode text check (payment_mode in ('cash', 'upi', 'bank', 'card')),
  -- what created the line, e.g. ('payslips', id) or ('advances', id)
  ref_table text,
  ref_id uuid,
  reverses_id uuid references public.ledger_entries (id),
  -- for re-run adjustments: the line type being corrected
  adjusts text check (adjusts in ('salary_earned', 'deduction', 'late_deduction')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by),
  check (case type
    when 'salary_earned' then amount_paise > 0
    when 'salary_payment' then amount_paise < 0
    when 'deduction' then amount_paise < 0
    when 'late_deduction' then amount_paise < 0
    when 'staff_charge' then amount_paise < 0
    when 'reimbursement' then amount_paise > 0
    else true end),
  check ((type = 'reversal') = (reverses_id is not null)),
  check ((type = 'adjustment') or adjusts is null)
);
create index ledger_entries_shop_staff_idx on public.ledger_entries (shop_id, staff_id, date);
create index ledger_entries_ref_idx on public.ledger_entries (ref_table, ref_id);
create index ledger_entries_reverses_idx on public.ledger_entries (reverses_id);
create index ledger_entries_shop_created_by_idx on public.ledger_entries (shop_id, created_by);
create unique index ledger_one_opening_balance on public.ledger_entries (staff_id) where type = 'opening_balance';
create unique index ledger_one_reversal_each on public.ledger_entries (reverses_id) where reverses_id is not null;

create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.reject_modification();

-- Stamp the author and check reversals and payslip payments.
create function private.check_ledger_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.ledger_entries;
  slip public.payslips;
  paid bigint;
begin
  if auth.uid() is not null then
    new.created_by := private.person_id(new.shop_id);
  end if;

  if new.type = 'reversal' then
    select * into original from public.ledger_entries where id = new.reverses_id;
    if not found or original.shop_id <> new.shop_id or original.staff_id <> new.staff_id then
      raise exception 'A reversal must undo a line of the same person' using errcode = 'check_violation';
    end if;
    if original.type = 'reversal' then
      raise exception 'A reversal can''t be reversed; add an adjustment instead' using errcode = 'check_violation';
    end if;
    if new.amount_paise <> -original.amount_paise then
      raise exception 'A reversal must be the exact opposite amount' using errcode = 'check_violation';
    end if;
  end if;

  if new.type = 'salary_payment' and new.ref_table = 'payslips' then
    select * into slip from public.payslips where id = new.ref_id;
    if not found or slip.shop_id <> new.shop_id or slip.staff_id <> new.staff_id then
      raise exception 'A payment must match its payslip' using errcode = 'check_violation';
    end if;
    if slip.status <> 'finalized' then
      raise exception 'Finalize the payslip before paying it' using errcode = 'check_violation';
    end if;
    -- payments are negative, their reversals positive
    select -coalesce(sum(l.amount_paise), 0) - coalesce(sum(r.amount_paise), 0) into paid
    from public.ledger_entries l
    left join public.ledger_entries r on r.reverses_id = l.id
    where l.type = 'salary_payment' and l.ref_table = 'payslips' and l.ref_id = slip.id;
    if paid - new.amount_paise > slip.net_pay_paise then
      raise exception 'That pays more than the payslip''s net pay' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger ledger_entries_check before insert on public.ledger_entries
  for each row execute function private.check_ledger_entry();

-- ---------------------------------------------------------------------------
-- Advances (given or repaid in cash); each one posts its ledger line
-- ---------------------------------------------------------------------------
create table public.advances (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  date date not null,
  kind text not null default 'given' check (kind in ('given', 'repaid')),
  amount_paise bigint not null check (amount_paise > 0),
  payment_mode text check (payment_mode in ('cash', 'upi', 'bank', 'card')),
  note text,
  -- giving past the person's limit needs an explicit confirmation (PLAN §4.7)
  over_limit_confirmed boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by)
);
create index advances_shop_staff_idx on public.advances (shop_id, staff_id);
create index advances_shop_created_by_idx on public.advances (shop_id, created_by);

create trigger advances_append_only before update or delete on public.advances
  for each row execute function private.reject_modification();

-- Outstanding advance: given − repaid − cut by finalized payslips (latest revision only).
create function private.advance_outstanding(p_staff uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum(case a.kind when 'given' then a.amount_paise else -a.amount_paise end)
              from public.advances a where a.staff_id = p_staff), 0)
    - coalesce((select sum(p.advance_cut_paise) from public.payslips p
                where p.staff_id = p_staff and p.status = 'finalized'
                  and p.revision = (select max(p2.revision) from public.payslips p2
                                    where p2.run_id = p.run_id and p2.staff_id = p.staff_id
                                      and p2.status = 'finalized')), 0)
$$;

create function private.before_advance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  limit_paise bigint;
begin
  if auth.uid() is not null then
    new.created_by := private.person_id(new.shop_id);
  end if;
  if new.kind = 'given' then
    select s.advance_limit_paise into limit_paise from public.staff s where s.person_id = new.staff_id;
    if limit_paise is not null and not new.over_limit_confirmed
       and private.advance_outstanding(new.staff_id) + new.amount_paise > limit_paise then
      raise exception 'This advance crosses the person''s limit; confirm to give it anyway'
        using errcode = 'check_violation', hint = 'over_limit';
    end if;
  end if;
  return new;
end;
$$;

create function private.post_advance()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ledger_entries (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id, note)
  values (new.shop_id, new.staff_id, new.date, 'advance',
          case new.kind when 'given' then -new.amount_paise else new.amount_paise end,
          new.payment_mode, 'advances', new.id, new.note);
  return new;
end;
$$;

create trigger advances_before before insert on public.advances
  for each row execute function private.before_advance();
create trigger advances_post after insert on public.advances
  for each row execute function private.post_advance();

-- ---------------------------------------------------------------------------
-- Finalizing a payslip: post ledger lines from it (or the differences, on a re-run)
-- ---------------------------------------------------------------------------
-- What a payslip posts: gross as salary_earned, deductions and late deduction as negatives.
-- The advance cut is not posted: the advance is already on the ledger (docs/DECISIONS.md).
create function private.payslip_postings(p_gross bigint, p_lines jsonb)
returns table (type text, name text, amount bigint)
language sql immutable set search_path = ''
as $$
  select 'salary_earned'::text, null::text, p_gross where p_gross <> 0
  union all
  select case l ->> 'kind' when 'deduction' then 'deduction' else 'late_deduction' end,
         l ->> 'name',
         -sum((l ->> 'amount')::bigint)::bigint
  from jsonb_array_elements(p_lines) l
  where l ->> 'kind' in ('deduction', 'late_deduction')
  group by 1, 2
$$;

create function public.finalize_payslip(p_payslip uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  slip public.payslips;
  run public.salary_runs;
begin
  select * into slip from public.payslips where id = p_payslip for update;
  if not found or not private.has_permission(slip.shop_id, 'salary.run') then
    raise exception 'Payslip not found' using errcode = 'insufficient_privilege';
  end if;
  if slip.status <> 'draft' then
    raise exception 'This payslip is already finalized' using errcode = 'check_violation';
  end if;
  select * into run from public.salary_runs where id = slip.run_id;

  if slip.revision = 1 then
    insert into public.ledger_entries (shop_id, staff_id, date, type, amount_paise, name, ref_table, ref_id)
    select slip.shop_id, slip.staff_id,
           (make_date(run.year, run.month, 1) + interval '1 month' - interval '1 day')::date,
           n.type, n.amount, n.name, 'payslips', slip.id
    from private.payslip_postings(slip.gross_paise, slip.lines) n
    where n.amount <> 0;
  else
    insert into public.ledger_entries (shop_id, staff_id, date, type, amount_paise, name, adjusts, ref_table, ref_id)
    select slip.shop_id, slip.staff_id, private.today_ist(), 'adjustment', d.delta, d.name, d.type,
           'payslips', slip.id
    from (
      select coalesce(n.type, o.type) as type, coalesce(n.name, o.name) as name,
             coalesce(n.amount, 0) - coalesce(o.amount, 0) as delta
      from private.payslip_postings(slip.gross_paise, slip.lines) n
      full join (
        select coalesce(l.adjusts, l.type) as type, l.name, sum(l.amount_paise)::bigint as amount
        from public.ledger_entries l
        join public.payslips p on p.id = l.ref_id and l.ref_table = 'payslips'
        where p.run_id = slip.run_id and p.staff_id = slip.staff_id and p.status = 'finalized'
          and l.type in ('salary_earned', 'deduction', 'late_deduction', 'adjustment')
        group by 1, 2
      ) o on o.type = n.type and o.name is not distinct from n.name
    ) d
    where d.delta <> 0;
  end if;

  if slip.leave is not null then
    insert into public.leave_balances as b
      (shop_id, staff_id, year, month, opening, earned, used, carried, paid_out, lapsed)
    values (slip.shop_id, slip.staff_id, run.year, run.month,
            coalesce((slip.leave ->> 'opening')::smallint, 0), coalesce((slip.leave ->> 'earned')::smallint, 0),
            coalesce((slip.leave ->> 'used')::smallint, 0), coalesce((slip.leave ->> 'carried')::smallint, 0),
            coalesce((slip.leave ->> 'paidOut')::smallint, 0), coalesce((slip.leave ->> 'lapsed')::smallint, 0))
    on conflict (staff_id, year, month) do update set
      opening = excluded.opening, earned = excluded.earned, used = excluded.used,
      carried = excluded.carried, paid_out = excluded.paid_out, lapsed = excluded.lapsed,
      updated_at = now();
  end if;

  perform set_config('fincrew.finalizing', 'on', true);
  update public.payslips
    set status = 'finalized', finalized_at = now(), finalized_by = private.person_id(slip.shop_id)
    where id = slip.id;
  perform set_config('fincrew.finalizing', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Balances (views run with the caller's rights, so RLS still applies)
-- ---------------------------------------------------------------------------
create view public.ledger_balances with (security_invoker = true) as
  select shop_id, staff_id, sum(amount_paise)::bigint as balance_paise
  from public.ledger_entries
  group by shop_id, staff_id;

create view public.advance_balances with (security_invoker = true) as
  select s.shop_id, s.person_id as staff_id, private.advance_outstanding(s.person_id) as outstanding_paise,
         s.advance_limit_paise, s.advance_cut_paise
  from public.staff s;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger salary_runs_audit after insert or update or delete on public.salary_runs
  for each row execute function private.write_audit();
create trigger payslips_audit after insert or update or delete on public.payslips
  for each row execute function private.write_audit();
create trigger advances_audit after insert on public.advances
  for each row execute function private.write_audit();
create trigger ledger_entries_audit after insert on public.ledger_entries
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.salary_runs enable row level security;
alter table public.payslips enable row level security;
alter table public.leave_balances enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.advances enable row level security;

create policy salary_runs_read on public.salary_runs for select to authenticated
  using (private.has_permission(shop_id, 'salary.view'));
create policy salary_runs_insert on public.salary_runs for insert to authenticated
  with check (private.has_permission(shop_id, 'salary.run'));

-- Staff see their own payslips once final; salary.view sees all; salary.run edits drafts.
create policy payslips_read on public.payslips for select to authenticated
  using ((private.is_self(staff_id) and status = 'finalized') or private.has_permission(shop_id, 'salary.view'));
create policy payslips_insert on public.payslips for insert to authenticated
  with check (private.has_permission(shop_id, 'salary.run'));
create policy payslips_update on public.payslips for update to authenticated
  using (private.has_permission(shop_id, 'salary.run'))
  with check (private.has_permission(shop_id, 'salary.run'));
create policy payslips_delete on public.payslips for delete to authenticated
  using (private.has_permission(shop_id, 'salary.run'));

create policy leave_balances_read on public.leave_balances for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.view')
         or private.has_permission(shop_id, 'salary.view'));

create policy ledger_entries_read on public.ledger_entries for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'salary.view'));
-- Direct inserts by type. Salary lines come only from finalize_payslip, advance lines only from
-- the advances table, expense lines from expenses (Phase 6).
create policy ledger_entries_insert on public.ledger_entries for insert to authenticated
  with check (case type
    when 'salary_payment' then private.has_permission(shop_id, 'salary.run')
    when 'reversal' then private.has_permission(shop_id, 'salary.undo_payment')
    when 'adjustment' then adjusts is null and private.has_permission(shop_id, 'salary.run')
    when 'opening_balance' then private.has_permission(shop_id, 'staff.pay.edit')
    else false end);

create policy advances_read on public.advances for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'salary.view')
         or private.has_permission(shop_id, 'advances.give'));
create policy advances_insert on public.advances for insert to authenticated
  with check (private.has_permission(shop_id, 'advances.give'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.salary_runs, public.payslips, public.leave_balances, public.ledger_entries,
  public.advances, public.ledger_balances, public.advance_balances from anon;
revoke update, delete on public.ledger_entries, public.advances from authenticated;
grant select on public.ledger_balances, public.advance_balances to authenticated;

revoke all on function private.guard_payslip(), private.check_ledger_entry(), private.before_advance(),
  private.post_advance(), private.payslip_postings(bigint, jsonb) from public, anon, authenticated;
revoke all on function private.advance_outstanding(uuid) from public, anon;
grant execute on function private.advance_outstanding(uuid) to authenticated, service_role;

revoke all on function public.finalize_payslip(uuid) from public, anon;
grant execute on function public.finalize_payslip(uuid) to authenticated;
