# FinCrew website screens

Phase 4.3, built from the reviewed key screens (`docs/DESIGN.md`) with `@fincrew/ui/tokens.css`,
the design's text styles and Lucide icons (24px, 2px stroke, the design system's fallback set).

## App shell — `apps/fincrew-web/src/app/(app)/layout.tsx`

- Sidebar (design: "Web · attendance grid"): FinCrew, the **shop switcher** card (current shop,
  "N shops"; opens the list to switch, plus "Add a shop" for owners), the sections, sign out.
  On a phone the sidebar stacks above the content.
- **Sections appear only when built and permitted**: Dashboard always; Staff with `staff.view`.
  Attendance, Salary, Expenses, Advances, Requests, Reports and Settings join as they ship.
- Pages outside the shell: `/login`, `/setup` (first run), `/shops/new`.

## Staff — `(app)/staff`

- **List** (`staff.view`): name with avatar, phone, joined, Active/Left; search by name or phone;
  show Active (default) / Left / All. Empty state for a new shop.
- **Add staff** (`staff.edit`, `/staff/new`): full name, phone (optional), joining date (defaults
  to today, IST). Calls `add_staff` (migration `20261023000005_add_staff.sql`), which writes the
  person and the staff row in one transaction under the caller's own access rules. Pay settings,
  leave template and the Staffora invite come with the staff detail screen.

## Staff detail — `(app)/staff/[id]`

- Tabs by permission: **Overview** (balance: due / owes / settled; advance to recover with monthly
  cut and limit; Call and WhatsApp), **Ledger** (`salary.view` or self: lines by month, newest
  first, with running balance from core `runningBalances`), **Pay** (`staff.pay.view` or self:
  current pay, overtime, shift and grace, leave template, allowances, deductions, history).
- **Change pay from a date** (`staff.pay.edit`): prefilled with current pay; amount parsed with
  `parseRupees`, times with `parseTimeOfDay`, date with `parseDisplayDate`; saves a dated
  `pay_settings` row (same date replaces it).
- Dates everywhere are DD/MM/YYYY (`formatDate` = core `formatDisplayDate`; `dateFieldProps`).

Checked in the browser on 2026-10-23 against the live project: shell, staff list, Add staff
("Test Staff"), staff detail tabs, saving pay (₹22,000 monthly, 9:30 AM – 8:30 PM).

## Attendance grid — `(app)/attendance`

- Staff × days for one month (`?month=YYYY-MM`, no future months), per the design. Every cell's
  status comes from `packages/core` `evaluateDays` with the shop's rules and each person's
  template, holidays and records (weekly offs and holidays fill in; sandwich rule; extra working
  days); late dot from `dayLateness` with that day's shift. Days / Late / Absent count up to today
  (`summarizeDays`), the same numbers the salary run uses.
- Seen with `staff.view` or `attendance.mark`. With `attendance.mark`: click days to select,
  **Set to** one status (present, half day, absent, paid leave, unpaid leave); **Mark today
  present** fills today's unmarked working days. Earlier days need `attendance.edit_past`;
  future days and days outside employment can't be selected.
- **Paid leave is refused beyond the month's balance** (PLAN §4.3): opening = last finalized
  month's carried balance, plus `earnedLeave` from the template; no template = no paid leave.
- Data loading: `src/lib/attendance-month.ts`; DB → core conversions: `src/lib/mappers.ts`
  (shared with the salary run). Save: `attendance/actions.ts` (`setAttendance`, upsert per day).

Checked in the browser on 2026-10-23 with Test Staff: Mark today present, paid leave refused
("0 paid leave left"), half day → Days 0.5; empty previous month.

## Salary run — `(app)/salary`

- `salary.view` sees it; `salary.run` works out, finalizes and pays. Month switcher (no future
  months); status chip Not worked out / Draft / Finalized / Paid; totals (net, gross, deductions,
  advance cuts); "Check before finalizing" lists payslip warnings (unmarked days, no pay set,
  missing check-out, negative net, paid leave over balance) with a link to attendance.
- Table per person (design: "Web · salary run review"): days, earned, overtime, allowances
  (incl. leave payout), gross, deductions, advance cut, net, payslip status. A row expands to the
  payslip lines, the month's days and Finalize / Pay for that person.
- **Work out / Run again** (`runSalary`): `src/lib/salary-month.ts` `computeMonth` runs
  `calculateSalary` and the leave roll (opening = last month's carried; payout days fed back in)
  for everyone employed that month. A draft is updated in place; after finalizing, a new revision
  is created only if lines or the advance cut changed (key-order-safe compare, jsonb reorders).
- **Finalize** (`finalizeSalary`, all drafts or one): `finalize_payslip` posts the ledger lines
  and the leave month. **Pay** (`paySalary`, one or everyone, with mode): a `salary_payment` for
  what's left of net pay (payments minus their reversals; `paidByPayslip`).

Checked in the browser on 2026-10-23 with Test Staff, **drafts only**: 0.5 days → ₹355 (22,000 ÷
31 × 0.5), unmarked-days warning, Run again → "0 new, 1 updated". Finalize and Pay were not run on
the live shop: ledger lines are permanent, so a finalized Test Staff could never be deleted.

## Not built yet

Staff detail: attendance calendar, edit details/leaving date, allowances and deductions editing,
leave template assignment, advance limit/cut, Staffora invite; advances (give/repay), holidays and leave-template screens, CSV export, payslip PDF/print,
requests, settings screens for every rule in `docs/features/core-rules.md`.
