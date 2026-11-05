-- Salary runs from each person's pay day, not from the 1st (owner 05/11/2026; packages/core
-- pay-period.ts). A payslip now remembers the days it covers: the next salary starts the day after
-- them even if the pay day changes later, and its ledger lines are dated on the last of them.
-- A payslip with no dates (older ones, or saved by an older app) covers the calendar month.
alter table public.payslips
  add column period_from date,
  add column period_to date,
  add constraint payslips_period_both check ((period_from is null) = (period_to is null)),
  add constraint payslips_period_order check (period_from <= period_to);

create or replace function public.finalize_payslip(p_payslip uuid)
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
           coalesce(slip.period_to,
                    (make_date(run.year, run.month, 1) + interval '1 month' - interval '1 day')::date),
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

revoke all on function public.finalize_payslip(uuid) from public, anon;
grant execute on function public.finalize_payslip(uuid) to authenticated;
