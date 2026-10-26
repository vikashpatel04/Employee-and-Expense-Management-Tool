-- "Clear all data" was a one-time clean-up of the owner's test data (done 2026-10-26) and is
-- removed again (owner: never wanted as a standing feature). The function goes, and the guards on
-- the ledger, advances, requests, payslips and the audit log are back to exactly the original
-- rules: nothing can lift them any more.
drop function public.clear_shop_data(uuid);

create or replace function private.reject_modification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

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
