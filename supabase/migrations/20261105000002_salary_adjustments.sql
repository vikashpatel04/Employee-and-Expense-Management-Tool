-- Add or less on one month's salary (owner 05/11/2026; docs/features/statements.md): named one-off
-- entries typed in Check and finalize, a bonus to add or something to take off. Salary stays live
-- until it is finalized, so they are kept here and worked into the figures; finalizing copies them
-- onto the payslip as lines. From then on they are locked, like the payslip itself.
create table public.salary_adjustments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  kind text not null check (kind in ('add', 'less')),
  name text not null check (length(trim(name)) between 1 and 60),
  amount_paise bigint not null check (amount_paise > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, created_by) references public.people (shop_id, id) on delete set null (created_by)
);
create index salary_adjustments_month_idx on public.salary_adjustments (shop_id, year, month);
create index salary_adjustments_staff_idx on public.salary_adjustments (shop_id, staff_id);

-- Finalized is final: nothing is added to or taken from a finalized month.
create function private.guard_salary_adjustment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row public.salary_adjustments;
begin
  if tg_op = 'DELETE' then row := old; else row := new; end if;
  if exists (
    select 1
    from public.payslips p
    join public.salary_runs r on r.id = p.run_id
    where p.staff_id = row.staff_id and r.shop_id = row.shop_id
      and r.year = row.year and r.month = row.month and p.status = 'finalized'
  ) then
    raise exception 'This salary is already finalized' using errcode = 'check_violation';
  end if;
  return row;
end;
$$;

create trigger salary_adjustments_guard before insert or delete on public.salary_adjustments
  for each row execute function private.guard_salary_adjustment();
create trigger salary_adjustments_audit after insert or delete on public.salary_adjustments
  for each row execute function private.write_audit();

alter table public.salary_adjustments enable row level security;

-- Read: yourself (Staffora's salary so far), or salary.view. Write: salary.run. Entries are added
-- and removed, never edited.
create policy salary_adjustments_read on public.salary_adjustments for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'salary.view'));
create policy salary_adjustments_insert on public.salary_adjustments for insert to authenticated
  with check (private.has_permission(shop_id, 'salary.run'));
create policy salary_adjustments_delete on public.salary_adjustments for delete to authenticated
  using (private.has_permission(shop_id, 'salary.run'));

revoke all on public.salary_adjustments from anon;
revoke update on public.salary_adjustments from authenticated;
revoke all on function private.guard_salary_adjustment() from public, anon, authenticated;
