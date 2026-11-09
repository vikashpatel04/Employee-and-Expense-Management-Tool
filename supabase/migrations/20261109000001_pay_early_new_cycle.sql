-- Paying salary early (owner 09/11/2026; docs/features/pay-early.md):
--   * every salary payment is dated the day it was paid ("Paid on"), never after today;
--   * Keep the pay day: a payment can go against a salary not finalized yet (its draft payslip);
--     it comes off when that salary is finalized, so a draft with payments can't be deleted;
--   * New cycle: the salary closes the day before the date paid, is finalized, and from that date
--     the person's pay day is the date paid (`finalize_new_cycle`).

alter table public.payslips
  add column new_cycle_from date,
  add constraint payslips_new_cycle_after_period
    check (new_cycle_from is null or (period_to is not null and new_cycle_from = period_to + 1));

-- check_ledger_entry from 20261029000002_reimbursement_paid.sql, plus: salary payments are dated
-- today or before, and may go against a draft payslip (paid early, no net pay to check yet).
create or replace function private.check_ledger_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  original public.ledger_entries;
  slip public.payslips;
  paid bigint;
  owed bigint;
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

  if new.type = 'salary_payment' and new.date > private.today_ist() then
    raise exception 'A payment can''t be dated after today' using errcode = 'check_violation';
  end if;

  if new.type = 'salary_payment' and new.ref_table = 'payslips' then
    select * into slip from public.payslips where id = new.ref_id;
    if not found or slip.shop_id <> new.shop_id or slip.staff_id <> new.staff_id then
      raise exception 'A payment must match its payslip' using errcode = 'check_violation';
    end if;
    if slip.status = 'finalized' then
      -- payments are negative, their reversals positive
      select -coalesce(sum(l.amount_paise), 0) - coalesce(sum(r.amount_paise), 0) into paid
      from public.ledger_entries l
      left join public.ledger_entries r on r.reverses_id = l.id
      where l.type = 'salary_payment' and l.ref_table = 'payslips' and l.ref_id = slip.id;
      if paid - new.amount_paise > slip.net_pay_paise then
        raise exception 'That pays more than the payslip''s net pay' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.type = 'reimbursement_paid' then
    select d.payback_paise into owed from private.expense_dues(new.staff_id) d;
    if -new.amount_paise > coalesce(owed, 0) then
      raise exception 'That pays back more than the shop owes them for expenses'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Whether anything was paid against a payslip (read past RLS, for the guard below).
create function private.payslip_has_payments(p_payslip uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ledger_entries
    where ref_table = 'payslips' and ref_id = p_payslip and type = 'salary_payment'
  )
$$;

-- guard_payslip from 20261026000006_remove_clear_data.sql, plus: a draft paid early stays.
create or replace function private.guard_payslip()
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
    if private.payslip_has_payments(old.id) then
      raise exception 'Part of this salary is paid already; it can''t be deleted'
        using errcode = 'check_violation';
    end if;
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

-- Finalize a salary that closes early and start the new cycle (needs salary.run): the draft says
-- where it closes (period_to) and where the new cycle starts (new_cycle_from, the date paid). The
-- person's pay day becomes that date of the month from then on, in every pay setting from that day.
create function public.finalize_new_cycle(p_payslip uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  slip public.payslips;
  run public.salary_runs;
  base public.pay_settings;
  pay_day jsonb;
begin
  select * into slip from public.payslips where id = p_payslip;
  if not found or not private.has_permission(slip.shop_id, 'salary.run') then
    raise exception 'Payslip not found' using errcode = 'insufficient_privilege';
  end if;
  if slip.new_cycle_from is null then
    raise exception 'This salary doesn''t start a new cycle' using errcode = 'check_violation';
  end if;
  select * into run from public.salary_runs where id = slip.run_id;
  if slip.new_cycle_from > private.today_ist() then
    raise exception 'A new cycle can''t start after today' using errcode = 'check_violation';
  end if;
  if slip.period_to < make_date(run.year, run.month, 1) or slip.period_from > slip.period_to then
    raise exception 'A new cycle must start in the month this salary is named after'
      using errcode = 'check_violation';
  end if;

  perform public.finalize_payslip(p_payslip);

  pay_day := jsonb_build_object(
    'payDay', jsonb_build_object('mode', 'fixed', 'day', extract(day from slip.new_cycle_from)::int));
  select * into base from public.pay_settings
    where staff_id = slip.staff_id and effective_from <= slip.new_cycle_from
    order by effective_from desc limit 1;
  if not found then
    raise exception 'Set their pay first' using errcode = 'check_violation';
  end if;
  if base.effective_from < slip.new_cycle_from then
    insert into public.pay_settings
      (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise, daily_wage_paise,
       hourly_rate_paise, overtime_rate_paise, shift_start, shift_end, grace_minutes, day_minutes,
       late_policy_override, pay_rules_override)
    values
      (base.shop_id, base.staff_id, slip.new_cycle_from, base.pay_type, base.monthly_salary_paise,
       base.daily_wage_paise, base.hourly_rate_paise, base.overtime_rate_paise, base.shift_start,
       base.shift_end, base.grace_minutes, base.day_minutes, base.late_policy_override,
       base.pay_rules_override || pay_day);
  end if;
  update public.pay_settings set pay_rules_override = pay_rules_override || pay_day
    where staff_id = slip.staff_id and effective_from >= slip.new_cycle_from;
end;
$$;

revoke all on function private.payslip_has_payments(uuid) from public, anon;
grant execute on function private.payslip_has_payments(uuid) to authenticated, service_role;
revoke all on function public.finalize_new_cycle(uuid) from public, anon;
grant execute on function public.finalize_new_cycle(uuid) to authenticated;
