-- Fix: undoing an advance (or a cash repayment) reversed its ledger line but the outstanding
-- advance still counted it, so "advance to recover" and salary-run cuts were too high.
-- An advance whose ledger line has been reversed no longer counts.

create or replace function private.advance_outstanding(p_staff uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum(case a.kind when 'given' then a.amount_paise else -a.amount_paise end)
              from public.advances a
              where a.staff_id = p_staff
                and not exists (
                  select 1
                  from public.ledger_entries l
                  join public.ledger_entries r on r.reverses_id = l.id
                  where l.ref_table = 'advances' and l.ref_id = a.id
                )), 0)
    - coalesce((select sum(p.advance_cut_paise) from public.payslips p
                where p.staff_id = p_staff and p.status = 'finalized'
                  and p.revision = (select max(p2.revision) from public.payslips p2
                                    where p2.run_id = p.run_id and p2.staff_id = p.staff_id
                                      and p2.status = 'finalized')), 0)
$$;
