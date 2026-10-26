-- "Clear all data" (owner's request 2026-10-26): the owner empties the shop's business records
-- (staff and helpers, attendance, money, expenses, requests, documents) to start real use after
-- testing. The shop, the owner, settings, roles, leave templates, holidays and expense
-- categories stay. The audit log is never touched (every deleted row is also written to it).
-- The append-only guards on the ledger, advances and requests stay in force for everyone; they
-- let go only inside this function (a transaction flag no API call can set), and never for the
-- audit log. Docs: docs/features/clear-data.md.

create or replace function private.reject_modification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name <> 'audit_log'
     and current_setting('fincrew.clearing', true) = 'on' then
    return coalesce(old, new);
  end if;
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- Owner only. Returns what was removed and the Storage files to delete afterwards (the website
-- removes them with the owner's session; Storage rows can't be deleted from SQL safely).
create function public.clear_shop_data(p_shop uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  counts jsonb := '{}'::jsonb;
  bills text[];
  docs text[];
  n int;
begin
  if not private.is_owner(p_shop) then
    raise exception 'Only the shop owner can clear the data' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(bill_path), '{}') into bills
  from public.expenses where shop_id = p_shop and bill_path is not null;
  select coalesce(array_agg(file_path), '{}') into docs
  from public.staff_documents where shop_id = p_shop;

  perform set_config('fincrew.clearing', 'on', true);

  -- Order: things that post to others first; people last.
  delete from public.requests where shop_id = p_shop;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('requests', n);
  delete from public.attendance_scans where shop_id = p_shop;
  delete from public.attendance_codes where shop_id = p_shop;
  delete from public.expenses where shop_id = p_shop;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('expenses', n);
  delete from public.advances where shop_id = p_shop;
  delete from public.ledger_entries where shop_id = p_shop;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('ledgerLines', n);
  delete from public.payslips where shop_id = p_shop;
  delete from public.salary_runs where shop_id = p_shop;
  delete from public.leave_balances where shop_id = p_shop;
  delete from public.attendance where shop_id = p_shop;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('attendance', n);
  delete from public.staff_documents where shop_id = p_shop;
  delete from public.allowances where shop_id = p_shop;
  delete from public.fixed_deductions where shop_id = p_shop;
  delete from public.pay_settings where shop_id = p_shop;
  delete from public.staff_leave_templates where shop_id = p_shop;
  delete from public.staff where shop_id = p_shop;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('staff', n);
  delete from public.people where shop_id = p_shop and not is_owner;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('people', n);

  perform set_config('fincrew.clearing', 'off', true);
  insert into public.audit_log (shop_id, actor_id, table_name, row_id, action, after)
  values (p_shop, private.person_id(p_shop), 'shops', p_shop::text, 'DELETE',
          jsonb_build_object('event', 'clear_shop_data', 'removed', counts));

  return jsonb_build_object('counts', counts, 'bills', to_jsonb(bills), 'docs', to_jsonb(docs));
end;
$$;

revoke all on function public.clear_shop_data(uuid) from public, anon;
grant execute on function public.clear_shop_data(uuid) to authenticated;
