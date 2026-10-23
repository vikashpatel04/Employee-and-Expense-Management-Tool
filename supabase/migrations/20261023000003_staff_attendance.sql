-- Phase 4.1: staff, pay settings, allowances, fixed deductions, leave templates, holidays,
-- attendance (docs/PLAN.md §5; rules in packages/core; settings in docs/features/core-rules.md).
--
-- Multi-shop safety: child rows carry shop_id and use COMPOSITE foreign keys
-- (shop_id, staff_id) → staff (shop_id, person_id), so a row can never point at another
-- shop's staff, template or person. Policies check the row's shop.
-- Money columns are integer paise (bigint). Times of day are minutes after IST midnight.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
alter table public.people add constraint people_shop_id_id_unique unique (shop_id, id);

create function private.is_self(p_person uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.people p where p.id = p_person and p.auth_user_id = auth.uid())
$$;

create function private.today_ist()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

revoke all on function private.is_self(uuid), private.today_ist() from public, anon;
grant execute on function private.is_self(uuid), private.today_ist() to authenticated, service_role;

-- Audit rows for tables keyed by person_id.
create or replace function private.write_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  row_shop uuid := coalesce((rec ->> 'shop_id')::uuid,
                            case when tg_table_name = 'shops' then (rec ->> 'id')::uuid end);
begin
  insert into public.audit_log (shop_id, actor_id, table_name, row_id, action, before, after)
  values (
    row_shop,
    private.person_id(row_shop),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'person_id',
             rec ->> 'role_id' || ':' || coalesce(rec ->> 'permission_key', rec ->> 'person_id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff (a person who works in the shop)
-- ---------------------------------------------------------------------------
create table public.staff (
  person_id uuid primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  joining_date date not null,
  leaving_date date,
  status text not null default 'active' check (status in ('active', 'left')),
  self_attendance boolean not null default false,
  device_id text,
  advance_limit_paise bigint check (advance_limit_paise >= 0),
  created_at timestamptz not null default now(),
  foreign key (shop_id, person_id) references public.people (shop_id, id) on delete cascade,
  unique (shop_id, person_id),
  check (leaving_date is null or leaving_date >= joining_date)
);

-- ---------------------------------------------------------------------------
-- Pay settings (dated; a change splits the month at its date)
-- ---------------------------------------------------------------------------
create table public.pay_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  effective_from date not null,
  pay_type text not null check (pay_type in ('monthly', 'daily', 'hourly')),
  monthly_salary_paise bigint check (monthly_salary_paise >= 0),
  daily_wage_paise bigint check (daily_wage_paise >= 0),
  hourly_rate_paise bigint check (hourly_rate_paise >= 0),
  overtime_rate_paise bigint check (overtime_rate_paise >= 0),
  shift_start smallint check (shift_start between 0 and 1439),
  shift_end smallint check (shift_end between 1 and 1440),
  grace_minutes smallint not null default 10 check (grace_minutes >= 0),
  -- hourly staff: minutes that make a day (leave payout); null = shift length
  day_minutes smallint check (day_minutes > 0),
  late_policy_override jsonb not null default '{}'::jsonb check (jsonb_typeof(late_policy_override) = 'object'),
  pay_rules_override jsonb not null default '{}'::jsonb check (jsonb_typeof(pay_rules_override) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  unique (staff_id, effective_from),
  check ((shift_start is null) = (shift_end is null)),
  check (shift_end is null or shift_end > shift_start),
  check (pay_type <> 'monthly' or monthly_salary_paise is not null),
  check (pay_type <> 'daily' or daily_wage_paise is not null),
  check (pay_type <> 'hourly' or hourly_rate_paise is not null)
);
create index pay_settings_shop_id_idx on public.pay_settings (shop_id);

create table public.allowances (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  amount_paise bigint not null check (amount_paise >= 0),
  prorated boolean not null default false,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from)
);
create index allowances_staff_idx on public.allowances (shop_id, staff_id);

create table public.fixed_deductions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  amount_paise bigint not null check (amount_paise >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from)
);
create index fixed_deductions_staff_idx on public.fixed_deductions (shop_id, staff_id);

-- ---------------------------------------------------------------------------
-- Leave templates (versions are dated; settings shapes: packages/core leave.ts)
-- ---------------------------------------------------------------------------
create table public.leave_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, name),
  unique (shop_id, id)
);

create table public.leave_template_versions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  template_id uuid not null,
  effective_from date not null,
  weekly_offs jsonb not null default '[]'::jsonb check (jsonb_typeof(weekly_offs) = 'array'),
  paid_leaves_per_month smallint not null default 0 check (paid_leaves_per_month >= 0),
  carry_over jsonb not null default '{"mode":"lapse"}'::jsonb check (jsonb_typeof(carry_over) = 'object'),
  sandwich jsonb not null
    default '{"enabled":false,"triggers":["absent"],"appliesTo":["weekly_off"],"sides":"both"}'::jsonb
    check (jsonb_typeof(sandwich) = 'object'),
  accrual jsonb not null default '{"mode":"full"}'::jsonb check (jsonb_typeof(accrual) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (shop_id, template_id) references public.leave_templates (shop_id, id) on delete cascade,
  unique (template_id, effective_from)
);
create index leave_template_versions_shop_idx on public.leave_template_versions (shop_id);

create table public.staff_leave_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  template_id uuid not null,
  effective_from date not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, template_id) references public.leave_templates (shop_id, id),
  unique (staff_id, effective_from)
);
create index staff_leave_templates_shop_idx on public.staff_leave_templates (shop_id, template_id);

-- ---------------------------------------------------------------------------
-- Holidays (shop-wide, each paid or not)
-- ---------------------------------------------------------------------------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  date date not null,
  name text not null check (length(trim(name)) > 0),
  paid boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, date)
);

-- ---------------------------------------------------------------------------
-- Attendance (one row per staff per day; late minutes are computed by packages/core)
-- ---------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  staff_id uuid not null,
  date date not null,
  status text not null check (status in
    ('present', 'half_day', 'absent', 'paid_leave', 'unpaid_leave', 'weekly_off', 'holiday')),
  check_in timestamptz,
  check_out timestamptz,
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  source text not null default 'manual' check (source in ('self', 'manual')),
  marked_by uuid,
  note text,
  updated_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff (shop_id, person_id) on delete cascade,
  foreign key (shop_id, marked_by) references public.people (shop_id, id) on delete set null (marked_by),
  unique (staff_id, date),
  check (check_out is null or check_in is null or check_out > check_in)
);
create index attendance_shop_date_idx on public.attendance (shop_id, date);

-- Who marked it: the signed-in person's record in that shop (null for self attendance,
-- which the edge function writes with the service role).
create function private.stamp_attendance()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.marked_by := private.person_id(new.shop_id);
    new.source := 'manual';
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_attendance() from public, anon, authenticated;

create trigger attendance_stamp before insert or update on public.attendance
  for each row execute function private.stamp_attendance();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger staff_audit after insert or update or delete on public.staff
  for each row execute function private.write_audit();
create trigger pay_settings_audit after insert or update or delete on public.pay_settings
  for each row execute function private.write_audit();
create trigger allowances_audit after insert or update or delete on public.allowances
  for each row execute function private.write_audit();
create trigger fixed_deductions_audit after insert or update or delete on public.fixed_deductions
  for each row execute function private.write_audit();
create trigger leave_templates_audit after insert or update or delete on public.leave_templates
  for each row execute function private.write_audit();
create trigger leave_template_versions_audit after insert or update or delete on public.leave_template_versions
  for each row execute function private.write_audit();
create trigger staff_leave_templates_audit after insert or update or delete on public.staff_leave_templates
  for each row execute function private.write_audit();
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function private.write_audit();
create trigger attendance_audit after insert or update or delete on public.attendance
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.pay_settings enable row level security;
alter table public.allowances enable row level security;
alter table public.fixed_deductions enable row level security;
alter table public.leave_templates enable row level security;
alter table public.leave_template_versions enable row level security;
alter table public.staff_leave_templates enable row level security;
alter table public.holidays enable row level security;
alter table public.attendance enable row level security;

-- staff: yourself, or staff.view; staff.edit writes. No deletes: people leave (leaving_date).
create policy staff_read on public.staff for select to authenticated
  using (private.is_self(person_id) or private.has_permission(shop_id, 'staff.view'));
create policy staff_insert on public.staff for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy staff_update on public.staff for update to authenticated
  using (private.has_permission(shop_id, 'staff.edit'))
  with check (private.has_permission(shop_id, 'staff.edit'));

-- pay settings, allowances, deductions: yourself, or staff.pay.view; staff.pay.edit writes.
create policy pay_settings_read on public.pay_settings for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.pay.view'));
create policy pay_settings_insert on public.pay_settings for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy pay_settings_update on public.pay_settings for update to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'))
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy pay_settings_delete on public.pay_settings for delete to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'));

create policy allowances_read on public.allowances for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.pay.view'));
create policy allowances_insert on public.allowances for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy allowances_update on public.allowances for update to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'))
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy allowances_delete on public.allowances for delete to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'));

create policy fixed_deductions_read on public.fixed_deductions for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.pay.view'));
create policy fixed_deductions_insert on public.fixed_deductions for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy fixed_deductions_update on public.fixed_deductions for update to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'))
  with check (private.has_permission(shop_id, 'staff.pay.edit'));
create policy fixed_deductions_delete on public.fixed_deductions for delete to authenticated
  using (private.has_permission(shop_id, 'staff.pay.edit'));

-- leave templates and versions: everyone in the shop reads (staff see their offs);
-- settings.leave_templates writes.
create policy leave_templates_read on public.leave_templates for select to authenticated
  using (private.is_member(shop_id));
create policy leave_templates_insert on public.leave_templates for insert to authenticated
  with check (private.has_permission(shop_id, 'settings.leave_templates'));
create policy leave_templates_update on public.leave_templates for update to authenticated
  using (private.has_permission(shop_id, 'settings.leave_templates'))
  with check (private.has_permission(shop_id, 'settings.leave_templates'));

create policy leave_template_versions_read on public.leave_template_versions for select to authenticated
  using (private.is_member(shop_id));
create policy leave_template_versions_insert on public.leave_template_versions for insert to authenticated
  with check (private.has_permission(shop_id, 'settings.leave_templates'));
create policy leave_template_versions_update on public.leave_template_versions for update to authenticated
  using (private.has_permission(shop_id, 'settings.leave_templates'))
  with check (private.has_permission(shop_id, 'settings.leave_templates'));
create policy leave_template_versions_delete on public.leave_template_versions for delete to authenticated
  using (private.has_permission(shop_id, 'settings.leave_templates'));

-- template assignments are part of a staff member's setup: staff.edit writes.
create policy staff_leave_templates_read on public.staff_leave_templates for select to authenticated
  using (private.is_self(staff_id) or private.has_permission(shop_id, 'staff.view'));
create policy staff_leave_templates_insert on public.staff_leave_templates for insert to authenticated
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy staff_leave_templates_update on public.staff_leave_templates for update to authenticated
  using (private.has_permission(shop_id, 'staff.edit'))
  with check (private.has_permission(shop_id, 'staff.edit'));
create policy staff_leave_templates_delete on public.staff_leave_templates for delete to authenticated
  using (private.has_permission(shop_id, 'staff.edit'));

-- holidays: everyone in the shop reads; settings.leave_templates writes (same settings area).
create policy holidays_read on public.holidays for select to authenticated
  using (private.is_member(shop_id));
create policy holidays_insert on public.holidays for insert to authenticated
  with check (private.has_permission(shop_id, 'settings.leave_templates'));
create policy holidays_update on public.holidays for update to authenticated
  using (private.has_permission(shop_id, 'settings.leave_templates'))
  with check (private.has_permission(shop_id, 'settings.leave_templates'));
create policy holidays_delete on public.holidays for delete to authenticated
  using (private.has_permission(shop_id, 'settings.leave_templates'));

-- attendance: yourself, or staff.view / attendance.mark reads. attendance.mark writes today
-- and later; earlier days also need attendance.edit_past. Self check-in goes through the
-- edge function (service role), not these policies.
create policy attendance_read on public.attendance for select to authenticated
  using (
    private.is_self(staff_id)
    or private.has_permission(shop_id, 'staff.view')
    or private.has_permission(shop_id, 'attendance.mark')
  );
create policy attendance_insert on public.attendance for insert to authenticated
  with check (
    private.has_permission(shop_id, 'attendance.mark')
    and (date >= private.today_ist() or private.has_permission(shop_id, 'attendance.edit_past'))
  );
create policy attendance_update on public.attendance for update to authenticated
  using (
    private.has_permission(shop_id, 'attendance.mark')
    and (date >= private.today_ist() or private.has_permission(shop_id, 'attendance.edit_past'))
  )
  with check (
    private.has_permission(shop_id, 'attendance.mark')
    and (date >= private.today_ist() or private.has_permission(shop_id, 'attendance.edit_past'))
  );
create policy attendance_delete on public.attendance for delete to authenticated
  using (
    private.has_permission(shop_id, 'attendance.mark')
    and (date >= private.today_ist() or private.has_permission(shop_id, 'attendance.edit_past'))
  );

revoke all on public.staff, public.pay_settings, public.allowances, public.fixed_deductions,
  public.leave_templates, public.leave_template_versions, public.staff_leave_templates,
  public.holidays, public.attendance from anon;
