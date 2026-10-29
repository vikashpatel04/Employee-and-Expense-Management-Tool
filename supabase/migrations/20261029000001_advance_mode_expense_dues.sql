-- Owner, 29/10/2026: how the salary run settles advances and expenses is set per staff member.
--
-- 1. Advance cut mode (staff Pay → Advance rules):
--      all   = cut everything still outstanding (default; capped at what the salary can cover)
--      fixed = cut up to advance_cut_paise a month, the rest carries to the next month
--      none  = no automatic cut
--    Existing staff: a monthly cut set → fixed (0 → none); none set → all.
-- 2. Expenses in the salary:
--      expense_payback = pay back what the shop owes them (reimbursement lines) with the salary
--      expense_recover = cut what is charged to them (staff_charge lines) from the salary
--    Like the advance cut, neither is posted to the ledger: the reimbursement / charge is already
--    there and the salary payment (net pay) settles it.

alter table public.staff
  add column advance_cut_mode text not null default 'all'
    check (advance_cut_mode in ('all', 'fixed', 'none')),
  add column expense_payback boolean not null default true,
  add column expense_recover boolean not null default true;

update public.staff
  set advance_cut_mode = case when advance_cut_paise = 0 then 'none' else 'fixed' end
  where advance_cut_paise is not null;

alter table public.payslips
  add column expense_payback_paise bigint not null default 0 check (expense_payback_paise >= 0),
  add column expense_cut_paise bigint not null default 0 check (expense_cut_paise >= 0);

-- Replace the net pay check (unnamed in 20261023000004_money.sql, so found by its definition).
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.payslips'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%net_pay_paise = (net_before_advance_paise - advance_cut_paise)%';
  if c is null then
    raise exception 'payslips net pay check not found';
  end if;
  execute format('alter table public.payslips drop constraint %I', c);
end;
$$;

alter table public.payslips
  add constraint payslips_net_pay_check check (
    net_pay_paise = net_before_advance_paise + expense_payback_paise - advance_cut_paise - expense_cut_paise
  );

-- What is still to settle through salary, per person:
--   payback = reimbursement lines not reversed − paid back by finalized payslips (latest revision)
--   charges = staff_charge lines not reversed − cut by finalized payslips (latest revision)
create function private.expense_dues(p_staff uuid)
returns table (payback_paise bigint, charge_paise bigint)
language sql stable security definer set search_path = ''
as $$
  with lines as (
    select l.type, l.amount_paise
    from public.ledger_entries l
    where l.staff_id = p_staff and l.type in ('reimbursement', 'staff_charge')
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
    greatest(0, coalesce((select sum(amount_paise) from lines where type = 'reimbursement'), 0)
                - (select payback from settled))::bigint,
    greatest(0, coalesce((select -sum(amount_paise) from lines where type = 'staff_charge'), 0)
                - (select cut from settled))::bigint
$$;

create view public.expense_balances with (security_invoker = true) as
  select s.shop_id, s.person_id as staff_id, d.payback_paise, d.charge_paise,
         s.expense_payback, s.expense_recover
  from public.staff s
  cross join lateral private.expense_dues(s.person_id) d;

create or replace view public.advance_balances with (security_invoker = true) as
  select s.shop_id, s.person_id as staff_id, private.advance_outstanding(s.person_id) as outstanding_paise,
         s.advance_limit_paise, s.advance_cut_paise, s.advance_cut_mode
  from public.staff s;

revoke all on function private.expense_dues(uuid) from public, anon;
grant execute on function private.expense_dues(uuid) to authenticated, service_role;
revoke all on public.expense_balances from anon;
grant select on public.expense_balances to authenticated;
