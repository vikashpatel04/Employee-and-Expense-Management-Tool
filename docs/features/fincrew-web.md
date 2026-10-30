# FinCrew website screens

Phase 4.3, built from the reviewed key screens (`docs/DESIGN.md`) with `@fincrew/ui/tokens.css`,
the design's text styles and Lucide icons (24px, 2px stroke, the design system's fallback set).

## Dashboard — `(app)/page.tsx`

Design: "Web · dashboard" (FinCrew key screens canvas). Data: `packages/data/src/dashboard.ts`
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

## Look and feel (owner's rework, 2026-10-25)

The owner found the website hard to use (the whole page scrolled with the sidebar, pages too
roomy, forms stacked as cards inside pages, no sign of loading). Reworked:

- **shadcn/ui on our tokens.** Components in `src/components/ui` (radix base, added with
  `pnpm dlx shadcn@4.22.1 add <name>` from `apps/fincrew-web`; config `components.json`).
  `globals.css` maps shadcn's colour names straight onto the FinCrew tokens (`bg-primary` =
  `--accent` teal, `bg-accent` = `--accent-soft`, `border-input` = `--line-strong`, …), light
  and dark, without defining shadcn's own variables (our `--accent` must stay the teal).
  `src/app/shadcn-tailwind.css` is shadcn's small CSS file copied in, so the CLI isn't a
  dependency. Strings inside the components go through i18n (`common.close`, `nav.*`, `loading`).
- **Web scale.** `globals.css` gives the token names web sizes (36 px controls, 10 px corners,
  22 px page titles, 14 px body); the phone apps keep the design-system sizes.
- **Shell** (`(app)/layout.tsx`, `(app)/app-sidebar.tsx`): shadcn Sidebar, fixed; a 48 px top
  bar with the menu button and the shop; **only the content area scrolls**. Shop switcher is a
  dropdown at the top of the sidebar. On a phone the sidebar slides in from the menu button.
- **Loading everywhere** (`src/components/app`):
  - `PendingLink` (every `Link` in the app is it): a thin bar runs across the top while the next
    page or tab loads, the content fades slightly (`NavDim`), and sidebar items and tabs show a
    spinner on themselves (`useLinkStatus`).
  - `(app)/loading.tsx` → `PageSkeleton` for a new section; tabs (`TabLinks`) sit above a
    `<Suspense key={tab}>` with `PanelSkeleton`, so a tab answers at once.
  - Buttons: anything with `aria-busy` shows a spinner before its label (`globals.css`); every
    form button sets it while saving (`useFormAction`'s `pending`), `FormSubmit` does it for
    plain `<form action>` / `next/form` searches.
  - Results show as **toasts** (sonner, top centre).
- **Tasks open in dialogs** (`FormDialog`, `useDialogDone`): the page shows a button, the form
  opens over it, and closes itself with a toast when the action returns `done`, or when the save
  redirects (redirects carry a changing value, e.g. `saved=<time>` / `at=<time>`, so a second
  identical save still closes it). Converted: Add staff (staff list; `/staff/new` still works),
  staff page header (Call, WhatsApp, Edit details, Give advance), Advance rules and Opening
  balance (Overview cards), Pay tab toolbar (Change pay from a date, Add an allowance, Add a
  fixed deduction, Change leave template, Own rules), Add expense (instant; editing opens a
  shadcn side sheet at `?edit=<id>`), Settings: Add category / Edit per row, Add holiday, New
  leave template, Rename / Assign / Change rules on a template, New role, Add helper, Rename
  role. Salary: Finalize asks first (AlertDialog), Pay opens a dialog with how it was paid.
- **Page grid** (owner, 2026-10-25: "proper grid or bento"; `src/components/app/layout.tsx`):
  every page is PageHeader → `StatGrid` of `StatCard`s (equal widths, fills the row whatever
  the count) → `Bento` (12 columns) of `Panel`s (title row with actions, `span` out of 12,
  stretched to the row's height; `flush` for edge-to-edge lists; `PanelEmpty` for "none yet").
  Dashboard: money figures row, then Today (7) beside Salary + Coming up (5). Expenses: figures,
  then **List | By category** views (owner, 2026-10-26: categories as their own view, not beside
  the list; `?view=categories`, month arrows keep the view): the list full width, or a category
  table (share bar, number of expenses, % of the month, amount, shop total row). Advances: figures + "Who owes" panel.
  Reports, salary: figures rows. Staff page: Overview balance (6) + opening balance (6), sign-in
  card full width; Ledger months (8) beside the balance (4, sticky); Pay in four panels, two
  rows (current pay | history, allowances | deductions — empty ones say "None yet"). Requests and
  the attendance code page: cards stretch to equal heights. Settings: categories and leave
  templates as card grids, holidays full width, roles intro above both columns, rules in rows
  of equal height (Pay | Coming late, Attendance code | Expenses + Staff sign-in) with Save at
  the end. Staff list: one toolbar row (search with icon, Search); **Active / Left / All** are tab links
  under it that filter at once (`?status=`, keeping the search; 30/10/2026 — they were radios
  that only applied after pressing Search).
  Staff page Attendance tab: the right column stretches to the calendar; Ledger months are
  panels level with the balance card.
  Checked 2026-10-25 with the owner's sign-in by measuring every card at 1366 px (rows equal
  height and level) and on screen at the pane's size.
- Left inline on purpose: request decisions (a queue is quicker inline), Settings → rules (the
  page is the form), a role's permissions and people (the page is for them), the attendance grid.

## Settings layout

Since 2026-10-26 (design "Web · settings"): a grouped sub-menu on the left (phone: a scrolling
row), the page on the right. Groups and pages shown by permission; **Data** (clear all data) for
the owner only. The rules page (2026-10-26) is a single column of section cards; each rule is a row with its
explanation on the left and the control on the right (stacked on a phone), Save at the end.

## App shell — `apps/fincrew-web/src/app/(app)/layout.tsx`

- Sidebar (see "Look and feel"): FinCrew, the **shop switcher** (current shop, "N shops";
  a dropdown to switch, plus "Add a shop" for owners), the sections, sign out.
- **Sections appear only when built and permitted**: Dashboard always; Staff with `staff.view`.
  Attendance, Salary, Advances and Settings (any settings permission) are in; Expenses, Requests
  and Reports join as they ship.
- Pages outside the shell: `/login`, `/setup` (first run), `/shops/new`.
- **Speed** (2026-10-25): `vercel.json` runs the server in Mumbai (`bom1`), next to the
  database (`ap-south-1`); it ran in Washington (`iad1`) and every database trip crossed the
  world, so each click took 3–5 s. `(app)/loading.tsx` shows a placeholder in the main area the
  moment a link is clicked (links prefetch it). `requireMe` / `myMemberships` are cached per
  request (React `cache`), so the layout and the page share one sign-in lookup.

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
- **Change pay from a date** (`staff.pay.edit`): prefilled with current pay; saved by the shared
  `savePay` (`packages/data/src/pay-write.ts`, also used by the Android app): amount parsed with
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
- **Reports** (`(app)/reports`, `reports.view`; data `packages/data/src/reports.ts`): range 3/6/12 months;
  tiles (total cost, salary, shop expenses, advances given); month-by-month table with
  salary/expense bars; shop expenses by category × month; CSV `reports/export?months=`
  (`reports.export`). Design "Web · reports".

## Expenses

See `docs/features/expenses.md` (page, add/edit panel, categories, bills, CSV, dashboard tile).

## Small screens

- Below `md` the sidebar slides in from the top bar's menu button (shadcn Sidebar's phone
  sheet) and closes after choosing a section.
- Attendance on a phone: **Day view** (design "Web · attendance on a phone (day view)"):
  previous/next day within the month up to today, chips (present incl. half days, absent,
  late, not marked), one row per person (status, minutes late, Days · Late · Absent for the
  month so far), tap rows to select then the same Set to / Not marked toolbar; Day | Month
  switch.

## Attendance — `(app)/attendance`

**Day view** (the default since 2026-10-25, owner: "like PagarBook"; design "Web · mark
attendance (day)" on the FinCrew canvas; `attendance/day-roster.tsx`): `?view=day&date=YYYY-MM-DD`
(no future days). Date bar (‹ › and "Back to today"), chips that count and filter (Present,
Absent, Half day, On leave, Off today, Not marked), search, **Mark N present** for everyone not
marked, then one row per person: name, weekly offs and Days · Late · Absent so far, check-in
and minutes late, and one-tap **P / A / HD / PL / UL**. A tap saves at once (the button fills
in before the server answers and goes back if it fails); the toast says who and what, with
**Undo** (their earlier mark, or no mark if the rules had filled the day). "⋯" → Remove the
mark. Same permissions as the grid (today with `attendance.mark`, earlier days with
`attendance.edit_past`) and the same `setAttendance` / `clearAttendance` actions.

**Month view** (`?view=month&month=YYYY-MM`): the grid below. Links from other pages to a month
(salary warnings) open it.

### Month grid

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
- Data loading: `packages/data/src/attendance-month.ts`; DB → core conversions: `packages/data/src/mappers.ts`
  (shared with the salary run). Save: `attendance/actions.ts` (`setAttendance`, upsert per day).

Checked in the browser on 2026-10-23 with Test Staff: Mark today present, paid leave refused
("0 paid leave left"), half day → Days 0.5; empty previous month.

## Attendance code, requests, Staffora sign-in (Phase 7)

`/code`, `/qr`, `/requests`, the staff Overview "Staffora sign-in" card and the public
Staffora sign-in card (phone number + PIN; the `/join` page was removed 2026-10-25): see
`docs/features/staff-self-service.md`.

## Salary run — `(app)/salary`

**Redesign (owner, 29/10/2026; design "Web · salary in steps")**: the page opens on the month as
steps — Attendance (days not marked) → Work out → Check & finalize (n of m ready) → Pay (still to
pay) — with a **Next step** card and its one button (Work out / Finalize n ready or Finalize
everyone / Pay everyone; Work out again beside it), the big amount (take-home, then still to pay,
with a paid bar), **How it adds up** (earned + allowances and overtime + expenses paid back −
advances cut − expenses charged − deductions = take-home), and people grouped **Needs a look**
(draft with a warning; Mark days → attendance) / **Ready to finalize** / **Still to pay** (Pay or
Pay rest) / **Paid**. A person opens their payslip on the side (`?person=<payslip id>`: days,
lines, take-home, Finalize / Pay / Print). Grouping and totals: `salaryGroup` / `salaryOverview`
in `packages/data/src/salary-run.ts` (shared with the app); `finalizeSalary` takes `payslipIds`
(the ready ones). **Full table** (`?table=1`, `salary/salary-table.tsx`) keeps the old wide table
described below.

- `salary.view` sees it; `salary.run` works out, finalizes and pays. Month switcher (no future
  months); status chip Not worked out / Draft / Finalized / Paid; totals (net, gross, deductions,
  advance cuts); "Check before finalizing" lists payslip warnings (unmarked days, no pay set,
  missing check-out, negative net, paid leave over balance) with a link to attendance.
- Full table per person (design: "Web · salary run review"): days, earned, overtime, allowances
  (incl. leave payout), gross, deductions, advance cut, net, payslip status. A row expands to the
  payslip lines, the month's days and Finalize / Pay for that person.
- **Work out / Run again** (`runSalary`): `packages/data/src/salary-month.ts` `computeMonth` runs
  `calculateSalary` and the leave roll (opening = last month's carried; payout days fed back in)
  for everyone employed that month. A draft is updated in place; after finalizing, a new revision
  is created only if lines or the advance cut changed (key-order-safe compare, jsonb reorders).
- **Finalize** (`finalizeSalary`, all drafts or one): `finalize_payslip` posts the ledger lines
  and the leave month. **Pay** (`paySalary`, one or everyone, with mode): a `salary_payment` for
  what's left of net pay (payments minus their reversals; `paidByPayslip`). The website always
  pays in full; `paySalary` also takes an `amount` for one payslip (the app's part payment).
- Since 2026-10-24 the steps and the page's data live in `packages/data/src/salary-run.ts`
  (`loadSalaryRun`, `runSalary`, `finalizeSalary`, `paySalary`), shared with the Android app;
  `salary/actions.ts` only checks the session, adds the messages and refreshes the page.

Checked in the browser on 2026-10-23 with Test Staff, **drafts only**: 0.5 days → ₹355 (22,000 ÷
31 × 0.5), unmarked-days warning, Run again → "0 new, 1 updated". Finalize and Pay were not run on
the live shop: ledger lines are permanent, so a finalized Test Staff could never be deleted.

## Advances — staff detail + `(app)/advances`

- Staff detail **Overview** (`advances.give`): **Give advance / Record repaid** (amount, date
  DD/MM/YYYY, mode, note) → `advances` row; the database posts the ledger line. Past the person's
  limit the database refuses (hint `over_limit`) and the form shows "Give it anyway" to confirm.
  **Advance rules** (`staff.edit`): limit and default monthly cut (blank = none / decide at run;
  shared `saveAdvanceSettings`).
- **Undo** (`salary.undo_payment`) on salary payments and advances in the Ledger tab: exact
  reversal, once; reversed lines show "Undone".
- **/advances** (`salary.view` or `advances.give`): people with an advance to recover, monthly
  cut, limit, total (`loadAdvanceBalances`). Actions: `staff/[id]/advance-actions.ts`
  (`recordAdvance` and undo use `recordAdvance` / `undoLedgerLine` from
  `packages/data/src/advances.ts`, shared with the Android app).

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
  (`packages/data/src/leave-setup.ts`). **New template**: name + rules (weekly off per weekday: working /
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

- **Roles** (`settings.roles`; `packages/data/src/roles.ts`): list with permission count and who has
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

Audit log viewer (PLAN §6.2), staff documents, dashboard "recent
activity". Staffora sign-ins, requests and the attendance code are built (see
`staff-self-service.md`).
