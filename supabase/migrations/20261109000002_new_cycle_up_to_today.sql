-- A new cycle starts the day after the last day its salary pays for (owner 09/11/2026: salary
-- paid on the evening of 08/11 covers 08/11, and the new cycle starts 09/11). So a salary can pay
-- up to today, with the new cycle from tomorrow. finalize_new_cycle from 20261109000001, with the
-- date check on the salary's last day instead of the new cycle's first.
create or replace function public.finalize_new_cycle(p_payslip uuid)
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
  if slip.period_to > private.today_ist() then
    raise exception 'A salary can''t pay up to a day after today' using errcode = 'check_violation';
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

revoke all on function public.finalize_new_cycle(uuid) from public, anon;
grant execute on function public.finalize_new_cycle(uuid) to authenticated;
