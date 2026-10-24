# FinCrew website screens

Phase 4.3, built from the reviewed key screens (`docs/DESIGN.md`) with `@fincrew/ui/tokens.css`,
the design's text styles and Lucide icons (24px, 2px stroke, the design system's fallback set).

## Dashboard — `(app)/page.tsx`

Design: "Web · dashboard" (FinCrew key screens canvas). Data: `src/lib/dashboard.ts`
(`loadToday`, `loadMoney`, `loadSalary`, `loadSoon`).

- Greeting by IST time of day, shop · weekday date · staff working today; **Mark today
  present** (`mark-today-button.tsx`, same `setAttendance` as the grid) for everyone not marked.
- **Today's attendance**: chips (present incl. half days, absent, late, not marked), "Not marked
  yet" and "Came late" lists (check-in time, minutes late) linking to staff detail; "Everyone is
  marked for today" when done.
- **Due to staff** (positive ledger balances) and **Advances to recover** (outstanding, people,
  monthly cut) tiles linking to Staff and Advances.
- **Salary · month**: state (Not worked out / Draft / Finalized / Paid), three steps, net / paid
  / still to pay, a note (people with unmarked days, how many paid) and the next action.
- **Coming up** (30 days): holidays (paid or not, "in N days"), last working days, and this
  month's salary (from the month's last day) until it's finalized.

Checked in the browser on 2026-10-24 against the live shop (1 staff, ₹355 draft), at 1280 and
375 px; Mark today present then cleared again from the grid.

## App shell — `apps/fincrew-web/src/app/(app)/layout.tsx`

- Sidebar (design: "Web · attendance grid"): FinCrew, the **shop switcher** card (current shop,
  "N shops"; opens the list to switch, plus "Add a shop" for owners), the sections, sign out.
  On a phone the sidebar stacks above the content.
- **Sections appear only when built and permitted**: Dashboard always; Staff with `staff.view`.
  Attendance, Salary, Advances and Settings (any settings permission) are in; Expenses, Requests
  and Reports join as they ship.
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
- **Overview extras**: **Details** (`staff.edit`: name, phone, joining date, leaving date; a
  leaving date marks them left) and **Opening balance** (`staff.pay.edit`: who owes, amount,
  as-of date, confirmation tick; one ledger line, shown instead of the form once set).
- **Pay tab extras**: allowances and deductions show until-dates and an "Ended" tag, with **End
  today** and two-step **Remove** (`staff.pay.edit`); **Add an allowance / fixed deduction**
  (name, monthly amount, from/until, allowance by days worked or full); **Change leave
  template** from a date (`staff.edit`); **Rules just for {name}** (`staff.pay.edit`): every pay
  and late rule with "Shop's rule (current value)" as the first choice; the current pay list
  shows "Own rules". Actions: `extra-actions.ts`, `rules-actions.ts`.

Checked in the browser on 2026-10-24 on Test Staff, every change reverted afterwards: details
save (phone, leaving date → listed under Left) and validation, allowance add / end / remove, own
rules saved on the existing pay version (DB checked) with Salary and Attendance still rendering,
then cleared; opening balance error path only.

Checked in the browser on 2026-10-23 against the live project: shell, staff list, Add staff
("Test Staff"), staff detail tabs, saving pay (₹22,000 monthly, 9:30 AM – 8:30 PM).

## Website extras (slice 13)

- **Staff detail · Attendance** (`staff/[id]/attendance-tab.tsx`, `day-change.tsx`):
  `?tab=attendance&month=YYYY-MM&day=YYYY-MM-DD`. Monday-first calendar from
  `loadAttendanceMonth` (status colour + icon, late dot, today bold, chosen day ringed); day
  card: status, minutes late, in/out times (`checkOut` now on grid cells), "From the leave
  template and holidays" when nobody marked it, **Change** (set a status or Not marked; same
  rules as the grid); month counts and payable days. Status icons/tokens: `src/lib/status-style.ts`.
- **Helpers** (Settings → Roles, `staff.edit`): add (name, phone), list with role count, remove
  (two clicks). Role people lists tag them "Helper". Actions `addHelper` / `removeHelper`.
- **Opening balance**: Overview shows the corrected figure ("(corrected)"); **Correct it**
  (`salary.run`) → `correctOpening` adds the difference as a correction line.
- **Reports** (`(app)/reports`, `reports.view`; data `src/lib/reports.ts`): range 3/6/12 months;
  tiles (total cost, salary, shop expenses, advances given); month-by-month table with
  salary/expense bars; shop expenses by category × month; CSV `reports/export?months=`
  (`reports.export`). Design "Web · reports".

## Expenses

See `docs/features/expenses.md` (page, add/edit panel, categories, bills, CSV, dashboard tile).

## Small screens

- Below `md` the sidebar is a 56 px top bar (FinCrew, shop name, Menu) — `(app)/nav-shell.tsx`;
  the menu holds the shop switcher, sections and sign out, and closes after navigating.
- Attendance on a phone: **Day view** (design "Web · attendance on a phone (day view)"):
  previous/next day within the month up to today, chips (present incl. half days, absent,
  late, not marked), one row per person (status, minutes late, Days · Late · Absent for the
  month so far), tap rows to select then the same Set to / Not marked toolbar; Day | Month
  switch.

## Attendance grid — `(app)/attendance`

- Names (left) and Days / Late / Absent (right) are pinned; only the days scroll.

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

## Advances — staff detail + `(app)/advances`

- Staff detail **Overview** (`advances.give`): **Give advance / Record repaid** (amount, date
  DD/MM/YYYY, mode, note) → `advances` row; the database posts the ledger line. Past the person's
  limit the database refuses (hint `over_limit`) and the form shows "Give it anyway" to confirm.
  **Advance rules** (`staff.edit`): limit and default monthly cut (blank = none / decide at run).
- **Undo** (`salary.undo_payment`) on salary payments and advances in the Ledger tab: exact
  reversal, once; reversed lines show "Undone".
- **/advances** (`salary.view` or `advances.give`): people with an advance to recover, monthly
  cut, limit, total. Actions: `staff/[id]/advance-actions.ts`.

Checked in the browser on 2026-10-23: both pages render; advance rules saved for Test Staff
(limit ₹5,000, cut ₹1,000). No advance was given on the live shop (permanent ledger line).

## Settings — `(app)/settings`

Tabs for the sections this person may change (`src/lib/settings-access.ts`); `/settings` opens
the first. No design artboards yet: built from the system's existing web patterns.

- **Holidays** (`settings.leave_templates`): by year (‹ ›), each with weekday, date and Paid /
  Unpaid; add (date, name, paid) — same date replaces; Remove. Used by the attendance grid and
  salary run as before.
- **Leave templates** (`settings.leave_templates`): list with today's rules in words
  (`src/lib/leave-text.ts`), "From" date and how many active staff are on it today
  (`src/lib/leave-setup.ts`). **New template**: name + rules (weekly off per weekday: working /
  paid off / unpaid off; paid leaves per month; carry-over with cap or leave-year end month;
  part-month accrual and rounding; sandwich rule with triggers, applies-to and sides), checked
  with core `validateTemplateVersion`. **Template page** (`leave/[id]`): rules by date (In use
  today / Starts later), **change the rules from a date** (same date replaces), staff on it today,
  rename, archive / bring back, and **move staff** (tick people + from date → dated
  `staff_leave_templates` rows; needs `staff.edit`).
- **Pay & attendance rules** (`settings.shop`): every `ShopRules` field (pay, coming late,
  attendance code, small expense limit) prefilled from `shops.settings` via `resolveShopRules`;
  saved whole after `validateShopRules`. Field reference: `docs/features/core-rules.md`.
- All website forms use `useFormAction` (`src/lib/use-form-action.ts`) so a refused save keeps
  the typed values.

- **Roles** (`settings.roles`; `src/lib/roles.ts`): list with permission count and who has
  each role (or "Nobody has it yet"); the owner is named as having everything. **New role**:
  name + permission checkboxes grouped by area (labels from i18n `permissions.*`). **Role page**
  (`roles/[id]`): what it may do (save = exactly the ticked ones), people with it (non-owner
  people; "No login yet" hint; needs `staff.view` to list them), rename, two-step delete.
  Saving revalidates the whole app, since permissions decide the sidebar and pages.

Checked in the browser on 2026-10-24: holiday add and remove (test holidays removed again);
leave form conditional fields and validation; rules form loads the defaults, shows fixed days /
late amount / time fields as chosen, keeps typed values after an error. No template was created
and the rules weren't saved on the live shop (the owner's choices). Roles: a test role was
created, edited, given to Test Staff, renamed and deleted on the live shop, with the database
checked at each step (left with no roles).

## Payslip, CSV, clearing marks

- **Payslip** — `app/payslips/[id]` (outside the shell): shop, month, employee, joined, pay
  period (DD/MM/YYYY, cut to joining/leaving), days, earnings and deductions lines (labels from
  `salary.lines.*`), gross, total deductions, net before advance, advance cut, net pay; for
  finalized payslips also paid so far and still to pay; a Draft notice otherwise. "Print or save
  as PDF" (`print-button.tsx`, light theme while printing). Linked as "Payslip" from each
  person's expanded row on Salary (opens a new tab).
- **Attendance CSV** — `(app)/attendance/export/route.ts` (GET `?month=YYYY-MM`,
  `reports.export`), built from `loadAttendanceMonth` and `src/lib/csv.ts` (`toCsv`: RFC 4180
  quoting, CRLF, BOM). "Download CSV" in the Attendance header.
- **Clear a mark** — grid toolbar "Not marked" → `clearAttendance` (deletes the rows; today
  needs `attendance.mark`, earlier days `attendance.edit_past`); message "Cleared N days".

Checked in the browser on 2026-10-24: payslip for Test Staff's October draft (₹355, matches the
run), CSV headers and bytes, print theme switch, mark today present then clear it (DB back to
only the 23/10 half day).

## Not built yet

Staffora invites (staff and helper logins), requests, attendance code screen (Phase 7).
