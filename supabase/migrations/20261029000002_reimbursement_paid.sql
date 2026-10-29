-- Owner, 29/10/2026: pay a staff member back for an expense they paid, now, without waiting for
-- the salary ("staff paid ₹30 for snacks, I give it back tomorrow").
--
-- A `reimbursement_paid` ledger line (negative: the shop paid them) with the payment mode. It
-- needs salary.run (paying staff money, like a salary payment), can't pay back more than the shop
-- still owes them for expenses, and is undone like a payment (a reversal, salary.undo_payment).
-- What the salary still pays back (`private.expense_dues`) subtracts these lines.

alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries add constraint ledger_entries_type_check
  check (type in ('opening_balance', 'salary_earned', 'salary_payment', 'advance', 'advance_cut',
    'late_deduction', 'deduction', 'reimbursement', 'reimbursement_paid', 'staff_charge',
    'adjustment', 'reversal'));
alter table public.ledger_entries add constraint ledger_entries_reimbursement_paid_sign
  check (type <> 'reimbursement_paid' or amount_paise < 0);

create or replace function private.expense_dues(p_staff uuid)
returns table (payback_paise bigint, charge_paise bigint)
language sql stable security definer set search_path = ''
as $$
  with lines as (
    select l.type, l.amount_paise
    from public.ledger_entries l
    where l.staff_id = p_staff and l.type in ('reimbursement', 'reimbursement_paid', 'staff_charge')
      and not exists (select 1 from public.ledger_entries r where r.reverses_id = l.id)
  ),
  settled as (
    select coalesce(sum(p.expense_payback_paise), 0) as payback,
           coalesce(sum(p.expense_cut_paise), 0) as cut
    from public.payslips p
    where p.staff_id = p_staff and p.status = 'finalized'
      and p.revision = (select max(p2.revision) from public.payslips p2
                        where p2.run_id = p.run_id and p2.staff_id = p.staff_id
                          and p2.status = 'finalized')
  )
  select
    -- reimbursement lines are positive, pay-backs negative
    greatest(0, coalesce((select sum(amount_paise) from lines
                          where type in ('reimbursement', 'reimbursement_paid')), 0)
                - (select payback from settled))::bigint,
    greatest(0, coalesce((select -sum(amount_paise) from lines where type = 'staff_charge'), 0)
                - (select cut from settled))::bigint
$$;

-- check_ledger_entry from 20261023000004_money.sql, plus the pay-back limit.
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

drop policy ledger_entries_insert on public.ledger_entries;
create policy ledger_entries_insert on public.ledger_entries for insert to authenticated
  with check (case type
    when 'salary_payment' then private.has_permission(shop_id, 'salary.run')
    when 'reimbursement_paid' then private.has_permission(shop_id, 'salary.run')
    when 'reversal' then private.has_permission(shop_id, 'salary.undo_payment')
    when 'adjustment' then adjusts is null and private.has_permission(shop_id, 'salary.run')
    when 'opening_balance' then private.has_permission(shop_id, 'staff.pay.edit')
    else false end);
