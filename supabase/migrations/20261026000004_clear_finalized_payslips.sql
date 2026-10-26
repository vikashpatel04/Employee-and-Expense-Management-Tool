-- Clear all data failed on a shop with a finalized payslip ("A finalized payslip can't be
-- changed"). Same rule as the ledger guards (20261026000003): finalized payslips can be removed
-- only inside public.clear_shop_data, which sets the transaction flag fincrew.clearing.
create or replace function private.guard_payslip()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  latest smallint;
  all_final boolean;
begin
  if tg_op = 'DELETE' and current_setting('fincrew.clearing', true) = 'on' then
    return old;
  end if;

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
