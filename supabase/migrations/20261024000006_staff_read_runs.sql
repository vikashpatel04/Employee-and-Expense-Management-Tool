-- Staff could see their own finalized payslips but not the salary run they belong to, so the
-- payslip's month (salary_runs.year / month) was missing for them in Staffora and on the
-- website's payslip page. A person may now read a run they have a finalized payslip in; runs
-- stay otherwise visible only with salary.view.

create policy salary_runs_read_own on public.salary_runs for select to authenticated
  using (
    exists (
      select 1 from public.payslips p
      where p.run_id = salary_runs.id
        and p.status = 'finalized'
        and private.is_self(p.staff_id)
    )
  );
