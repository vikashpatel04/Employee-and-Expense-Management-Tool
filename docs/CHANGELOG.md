# Changelog

## Unreleased

### Fixed — 2026-10-24

- Staff can see the month of their own finalized payslips (Staffora Payslips, website payslip
  page). Migration `20261024000006_staff_read_runs.sql`.
- Staffora Home says when the shop already marked the day.

### Added — 2026-10-24 (Staffora slice B)

- Staffora: Attendance calendar, Money (balance, advance, ledger, payslips, payslip page), ask for
  leave or an advance and see / cancel my requests.

### Added — 2026-10-24 (Staffora slice A)

- Staffora staff app (`apps/staffora-mobile`): welcome, join from the invite link with a PIN set
  twice, PIN to open, Home with today and this month, check-in / check-out by typing the code or
  scanning the QR, checked-in screen, Me (lock, remove from this phone).

### Added — 2026-10-24 (Phase 7 data)

- Attendance codes (daily or manual change, regenerate) and check-in / check-out by code with
  cooldown, minimum gap, wrong-code wait and phone binding; every attempt recorded.
- Leave and advance requests (ask, cancel, approve / reject).
- Staff invites and 4-digit PIN sign-in through the `staff-auth` edge function, with wrong-PIN
  wait and lock; owner can see logins, unlock and reset the phone. Settings → Staff sign-in.
- Migrations `20261024000003_attendance_codes.sql`, `20261024000004_requests.sql`,
  `20261024000005_staff_login.sql`.
- Website: Attendance code page (copy, new code, QR, full screen, print, today's check-ins),
  Requests (approve / reject with paid or unpaid leave, advance mode), dashboard banner, Staffora
  sign-in card on the staff page, public invite page `/join/<token>`.
- Android app: Attendance code screen with full-screen QR, Requests screen, Today button and
  banner.

### Added — 2026-10-24 (Phase 5 slice C)

- Android app Money tab: expenses (month view, add / edit / delete with bill photo), salary
  (months, work out, check, finalize, pay all or one), advances (who owes, give or record paid
  back with the over-limit confirm). Staff detail: Give advance and Pay what's due.
- Expense, salary and advance saving moved into `@fincrew/data`; the website uses the same code.

### Added — 2026-10-24 (Phase 5 slice B)

- Android app Staff tab: list with search and filters, staff detail with Overview, Attendance
  (calendar, change a day), Ledger and Pay.

### Added — 2026-10-24 (Phase 5 slice A)

- FinCrew Android app (Expo): sign-in, shop switch, Today (mark attendance, Mark all present),
  More. Shared attendance writing and session loading in `@fincrew/data`.

### Added — 2026-10-24 (slice 13: website extras)

- Staff detail Attendance tab (calendar, day detail, change a day).
- Helpers (people not on the payroll) in Settings → Roles.
- Correct an opening balance (correction line on the ledger).
- Reports: month-by-month money and expenses by category, 3/6/12 months, CSV.

### Fixed — 2026-10-24

- Undoing an advance now also lowers the advance to recover (and salary-run cuts).
- Reports page no longer widens the phone screen.

### Added — 2026-10-24 (Phase 6: expenses)

- Expenses with paid by / charged to / pay back, staff ledger lines, bill photos, categories,
  month view with totals, CSV, dashboard tile. Migration `20261024000001_expenses.sql`.

### Changed — 2026-10-24 (Phase 4.3 slice 11)

- Attendance grid keeps names and Days/Late/Absent in view while the days scroll.
- Phones: the sidebar becomes a top bar with a Menu button; Attendance opens in a Day view
  (Day | Month switch).

### Added — 2026-10-24 (Phase 4.3 slice 10)

- Website dashboard: today's attendance, money due, advances, this month's salary, coming up.

### Added — 2026-10-24 (Phase 4.3 slice 9)

- Printable payslip (print or save as PDF), attendance CSV download, clear attendance marks.

### Added — 2026-10-24 (Phase 4.3 slice 8)

- Staff detail: edit details and leaving date, opening balance, allowances and deductions (add,
  end, remove), change leave template from a date, rules just for one person.

### Fixed — 2026-10-24

- Changing pay from a date keeps the person's own rules.

### Added — 2026-10-24 (Phase 4.3 slice 7)

- Settings → Roles: create roles, tick permissions, give them to people, rename, delete.
- `@fincrew/i18n` test: every permission key has a label.

### Added — 2026-10-24 (Phase 4.3 slice 6)

- Settings: holidays, leave templates (rules by date, assign staff, rename, archive), pay &
  attendance rules.

### Fixed — 2026-10-24

- Website forms keep what was typed when a save is refused (React 19 reset forms after an action).

### Added — 2026-10-23 (Phase 4.3 slice 5)

- Advances: give, record repaid, advance rules, undo payments/advances, Advances page.

### Added — 2026-10-23 (Phase 4.3 slice 4)

- Salary run: work out, run again, review per person, finalize, pay.

### Added — 2026-10-23 (Phase 4.3 slice 3)

- Attendance grid: month view, bulk Set to, Mark today present, paid-leave balance check.

### Added — 2026-10-23 (Phase 4.3 slice 2)

- Staff detail: overview, ledger, pay, change pay from a date.
- Core: `parseRupees`, `paiseToInput`, time-of-day helpers, `formatDisplayDate`, `parseDisplayDate`.

### Changed — 2026-10-23

- Every date is shown and typed as DD/MM/YYYY.

### Added — 2026-10-23 (Phase 4.3 slice 1)

- Website app shell with shop switcher; Staff list and Add staff; `add_staff` RPC.

### Added — 2026-10-23 (Phase 4.2: money data)

- Tables: advances, ledger_entries, salary_runs, payslips, leave_balances; views
  ledger_balances, advance_balances; `finalize_payslip`; `staff.advance_cut_paise`.
- Performance: `people_read` evaluates `auth.uid()` once; covering indexes for 4.1 foreign keys.

### Added — 2026-10-23 (Phase 4.1: data layer)

- Tables: staff, pay_settings, allowances, fixed_deductions, leave_templates,
  leave_template_versions, staff_leave_templates, holidays, attendance, with RLS, audit and
  composite shop-safe foreign keys.

### Added — 2026-10-23 (multi-shop)

- A login can belong to several shops; permissions, settings, roles and data are per shop.
- `create_shop` (first run, or an owner adding a shop) replaces `setup_shop`;
  `my_permissions(p_shop)`.
- Website: shop switcher and "Add a shop" for owners.
- Write policies split into insert/update/delete; foreign-key indexes.

### Changed — 2026-10-23 (rules are settings)

- `packages/core/src/settings.ts`: shop rule set with defaults, per-staff overrides, validation.
- New settings: day-rate basis, off-day work, unmarked days, holiday vs weekly off, marks on off
  days, sandwich triggers/sides/applies-to, leave accrual (full/prorated), late count start,
  half-day threshold off, half day uses free day, per-day late charge, lockout values, hourly
  hours per day.
- Leave template versions: `sandwichRule: boolean` → `sandwich` object; new `accrual`.
- Staff with no leave template supported (no offs, no paid leave).

### Added — 2026-10-23 (Phase 2: Core logic)

- `packages/core` rules for PLAN §4: `rational`, `dated`, `leave`, `attendance`, `late`,
  `salary`, `ledger`, `expenses`, `attendance-code`; extended `dates`. 154 tests.
- `docs/features/core-rules.md`.

### Deployed — 2026-10-23

- FinCrew web live at https://fincrew-web.vercel.app. Phase 1 (Foundation) complete.

### Added — 2026-10-23

- CI `migrate` job: applies `supabase/migrations/` to the live project on push to `main` after
  all checks pass.
- `scripts/check-migrations.sh`: CI fails on edits to applied migrations or out-of-order new ones.
- Root scripts `pnpm db:login`, `pnpm db:types`; root `.env.example` for the project ref.

### Security — 2026-10-23

- Migration `20261023000001_harden_functions.sql` (applied 2026-10-23): helper and trigger functions moved to a
  non-exposed `private` schema; anonymous users can only call `ping()`; new functions are no
  longer executable by anon/PUBLIC by default; `ping()` search_path fixed. Tests in
  `supabase/tests/functions.test.ts`.

### Changed — 2026-10-23

- `packages/db` now has real types generated from the live project; removed the temporary cast in
  `apps/fincrew-web/src/lib/session.ts`.
- `scripts/db-types.mjs` validates the project ref and no longer triggers Node's DEP0190 warning.
- Supabase CLI moved from `supabase/` package to the repo root; `packages/db` `gen:types`
  replaced by `pnpm db:types`.
- `docs/SETUP.md` reordered: Supabase project → GitHub secrets → push (migrations apply) →
  owner login.

### Added — 2026-10-22 (Phase 1: Foundation)

- Monorepo: Turborepo + pnpm; `apps/fincrew-web`, `packages/{core,db,ui,i18n}`, `supabase/`.
- `packages/core`: paise money helpers (`formatINR`, `roundToRupee`, `rupeesToPaise`), IST
  business dates, permission keys.
- Database: shops, people, roles and permissions, audit log, RLS helpers, owner protection,
  shop setup, keep-awake ping.
- FinCrew web: sign-in, first-run shop setup, home, sign-out.
- CI workflow and Supabase keep-awake workflow.
