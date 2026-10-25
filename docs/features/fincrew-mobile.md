# FinCrew Android app

Phase 5 (started 2026-10-24). Expo SDK 58 + Expo Router, `apps/fincrew-mobile`
(`@fincrew/mobile`). Screens follow the Android artboards on the FinCrew key screens canvas
(`docs/DESIGN.md`); every rule and data load is shared with the website through
`packages/core` and `packages/data`, so both apps always agree.

## Run it

```bash
pnpm --filter @fincrew/mobile web      # in a browser at phone size (http://localhost:8081)
pnpm --filter @fincrew/mobile start    # Expo dev server for a phone / emulator
```

Needs `apps/fincrew-mobile/.env.local` with `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (copy `.env.example`; same public values as the website).
Preview config `.claude/launch.json` → "fincrew-mobile-web". Real Android builds go through
EAS (needs the owner's Expo account; not set up yet). Android package id `app.fincrew.mobile`
is a placeholder until the first store build.

## Built

- **Foundations** (`src/lib`): `theme.ts` (FinCrew palette light/dark from `@fincrew/ui`
  `themes`, design text styles in Anek Latin per weight), `supabase.ts` (publishable key only;
  session kept with AsyncStorage on the phone), `session.tsx` (sign-in state, shops and
  permissions via `@fincrew/data` `loadMemberships` / `loadMe`, chosen shop remembered),
  `i18n.ts` (same strings as the website).
- **Components** (`src/components`): `ui.tsx` (Text, Card, Button, Avatar, StatusPill,
  SummaryChip, SectionTitle), `sheet.tsx` (bottom sheet), `shop-header.tsx` (current shop +
  "Your shops" switch sheet), `coming-next.tsx`.
- **Sign in** (`src/app/sign-in.tsx`): email + password; signed-out users are kept here by the
  root layout's guard (`Stack.Protected`).
- **Tabs** (`src/app/(tabs)`): Today · Staff · Money · More (PLAN §6.1).
- **Today** (`(tabs)/index.tsx`, design "Today"): shop header, day switcher (no future days),
  chips present / absent / late / not marked (tap to filter), "Not marked" and "Marked" lists
  (avatar, name, check-in or weekly offs, status pill, minutes late), tap a person → status
  sheet (Present, Half day, Absent, Paid leave, Unpaid leave, Not marked), **Mark all present**.
  Data: `loadAttendanceMonth`; writes: `writeAttendance` (future days refused, past days need
  `attendance.edit_past`, paid leave within the balance) — the same functions the website uses.
- **Staff** (`(tabs)/staff.tsx`): search by name or phone, Active / Left / All, rows with
  phone or joining/leaving date and today's status; tap → staff detail.
- **Staff detail** (`staff/[id].tsx`, design "Staff detail"): back, avatar, name, joined,
  today's status / minutes late / check-in; tabs by permission (Ledger: self or `salary.view`;
  Pay: self or `staff.pay.view`), components in `src/components/staff/`:
  - **Overview**: balance (due / owes / settled), advance to recover with cut and limit,
    **Pay ₹…** (with `salary.run`, when finalized salary is still due: pays every unpaid month,
    oldest first, `loadPayslipsDue` + `paySalary`), **Give advance** (`advances.give`, active
    staff; the shared advance sheet), Call and WhatsApp, this month's present / late / paid
    leave / half day and payable days.
  - **Attendance**: Monday-first month calendar (status colour + icon, late dot, today bold),
    chosen day's status, minutes late, in/out times, **Change** with the shared status sheet
    (`writeAttendance`), month counts.
  - **Ledger**: balance, lines by month newest first with running balance, "Undone" marks.
    **Undo** (`salary.undo_payment`) on a salary payment or an advance: a sheet asks first
    ("Adds a line of +₹… dated today that cancels it"), then `undoLedgerLine` adds the exact
    reversal, once (2026-10-25).
  - **Pay**: current pay, overtime, shift and grace, leave template, own rules, **advance rules**
    (limit, monthly cut), allowances, deductions, history. **Change pay from a date**
    (`staff.pay.edit`) opens `src/app/pay-change.tsx`: from-date (DD/MM/YYYY, later dates
    allowed), pay type, amount, overtime, shift (24-hour "09:30"), grace, hours a day for hourly
    pay, prefilled with today's pay; saves with the shared `savePay`. **Advance rules for this
    person** (`staff.edit`) opens a sheet with limit and cut (blank = none / decide at each run;
    shared `saveAdvanceSettings`). Reloads when you come back. Allowances, deductions, leave
    template and own rules still change on the website (2026-10-25).
- Shared loaders in `packages/data/src/staff.ts`: `loadStaffList`, `loadStaffOverview`,
  `loadLedger`, `loadPay`. Shared components: `status-sheet.tsx` (StatusPicker sheet used by
  Today and staff Attendance), `Segmented`, `IconButton` in `ui.tsx`.
- **Money** (`(tabs)/money.tsx`, design "Money · expenses / salary / advances"): segments by
  permission (Expenses: `expenses.add` / `view_all` / `edit`; Salary: `salary.view`; Advances:
  `salary.view` or `advances.give`), components in `src/components/money/`:
  - **Expenses** (`expenses.tsx`): month switcher, shop total with charged to staff / paid back /
    not tracked, by category bars, expenses by day (category icon and colour, note or category,
    who paid, mode, staff / not-tracked tag, bill icon); tap → the expense; **Add expense**
    (needs an active category). Data: `loadExpenseMonth`; reloads when you come back.
  - **Add / edit expense** (`src/app/expense.tsx`, design "Add expense"): amount with quick
    amounts, day stepper (no future days), category grid (7 + "All N"), Paid by (+ who from a
    sheet, Pay them back), Charged to (+ who; below the small-expense limit a new one starts as
    Not tracked), bill photo (camera or gallery with `expo-image-picker`, shrunk to ~200 KB
    JPEG with `expo-image-manipulator`, `src/lib/bill-photo.ts`; shows the saved photo through a
    signed link), Paid with, note, delete (two taps). Read-only without edit permission. Saves
    through `saveExpense` / `deleteExpense` (`@fincrew/data`), ids from `expo-crypto`.
  - **Salary** (`salary.tsx`): this month and the 3 before with state (Not worked out / Draft /
    Finalized / Paid), net and what's still to pay; tap → the run.
  - **Salary run** (`src/app/salary/[month].tsx`, design "Salary run"): month switcher, state
    pill, net (or still to pay), gross / deductions / advance cuts, "Check before finalizing"
    warnings, people (days, advance cut or first warning, net, Paid / Due); tap a person for the
    payslip lines, **Send payslip** and **Pay ₹…** for them. Bottom: Work out salary / Finalize
    salary while it's a draft; once finalized **Share payslips** + **Pay all due**, and Run
    again as a quiet button. Finalize and pay ask first in a sheet (permanent ledger lines). The
    pay sheet for one person (design "Salary run · pay one") has the **amount** (prefilled with
    what's due; less pays part, the rest stays due — `paySalary` `amount`, the database refuses
    more than net pay), the mode, and **Send the payslip on WhatsApp** (on by default). **Share
    payslips** lists every finalized person with Send payslip. Sending (`src/lib/share-payslip.ts`)
    loads the payslip fresh and opens `wa.me/91<number>?text=…` with `payslipShareText` (the
    same text Staffora shares); without a saved phone number it opens the phone's share sheet.
    Uses `loadSalaryRun` (now with each person's phone), `runSalary`, `finalizeSalary`,
    `paySalary`, `loadPayslipView`. (2026-10-25)
  - **Advances** (`advances.tsx`): total to recover, who owes (cut each month or decided at the
    run, limit); tap a person or **Give advance** (pick a person) → advance sheet.
  - **Advance sheet** (`src/components/advance-sheet.tsx`): Give advance / Paid back, amount, day,
    mode, note; past the limit the database refuses and the sheet asks **Give anyway**
    (`recordAdvance`, `confirmOverLimit`).
- Form pieces (`src/components/form.tsx`): Field, AmountField, DayStepper, MonthStepper, Notice,
  FormMessage, BottomBar, Checkbox. Money helpers (`src/lib/money.ts`): month names from i18n, category
  icons/colours (same keys as the website).
- **Attendance code** (`src/app/code.tsx`) and **Requests** (`src/app/requests.tsx`), opened
  from Today's "Attendance code" button and "N requests waiting" banner: see
  `docs/features/staff-self-service.md`.
- **More**: who is signed in, the website link, sign out.

## Checked

2026-10-24 (slice C, Money), owner signed in, live shop at 375 × 812:

- **Expenses**: empty month; with the test category made active for the check: Save with
  nothing → "Enter the amount in rupees."; amount only → "Choose a category."; added ₹125.50
  (UPI, note) → list, totals and by-category updated on return; edited (day before, Not tracked
  → hint "Kept for the record…", moved to Not tracked total); deleted (two taps). Category
  archived again; no expenses, bills or ledger lines left.
- **Salary**: months list (October draft ₹355, others Not worked out); run screen shows totals,
  the unmarked-days warning, the payslip lines; Finalize asks first (cancelled — not finalized).
- **Advances**: total ₹0.00, Give advance → person picker → form with "Owes ₹0.00 · limit
  ₹5,000.00"; empty amount refused. Staff detail shows Give advance (same sheet).
- **Salary end to end** (later the same day, with the owner's OK): Run again, Finalize, then
  Pay ₹1,065.00 by UPI from Test Staff's Overview → Settled ₹0.00; Ledger shows salary +₹1,065
  (31/10) and salary paid −₹1,065 (24/10). Paying before the month end makes the running balance
  dip below zero between the two dates — correct by date.
- **Not checked live** (would write permanent lines or need a phone): giving an advance and the over-limit "Give anyway" (covered by the DB tests and the website),
  staff detail Pay, taking/uploading a bill photo (file picker / camera), Android device.
- Website after the move to shared code: build passes; salary and advances pages render the same.

2026-10-24, signed in by the owner, live shop at 375 × 812:

- **Today**: real data (Sat 24/10/2026, Test Staff not marked); status sheet → Present; paid
  leave refused with the shared rule ("Test Staff has 0 paid leave left this month."); Not
  marked clears; Mark all present (confirmation now shown for one person too) and clear;
  23/10 shows the half day; 22/10 "Nobody works here on this day".
- **Staff**: list, search incl. "Nobody matches", Active/Left filter; detail Overview (settled
  ₹0.00, advance ₹0.00, cut ₹1,000 / limit ₹5,000, October: 1 half day, 0.5 payable days; no
  phone so no Call/WhatsApp), Attendance calendar and Change on today (header followed), Ledger
  (empty: Test Staff has no lines — lines with data not seen yet), Pay (₹22,000 monthly, ₹100
  overtime, 9:30 AM – 8:30 PM, 10 min grace, no template, shop's rules).
- Database back to the one 23/10 half day afterwards.

2026-10-24 (slice B): typecheck, tests and build pass; signed-out visits to `/staff` go to Sign
in. Staff screens not yet seen with data (owner sign-in needed).

2026-10-24, in the browser at 375 × 812: the app starts, signed-out users land on Sign in, the
screen matches the design and fits the width. Today could not be checked yet: it needs the
owner to sign in (never typed for them).

## Next

Allowances, deductions, leave template and own rules from the app (website only), bill photo on
a real phone, push notifications, widgets (Phase 8), EAS builds.
