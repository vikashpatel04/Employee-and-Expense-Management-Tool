# Changelog

## Unreleased

### Changed — 2026-10-30 (open source tidy-up)

- **README** rewritten for people finding the project on GitHub: what it does, how it is laid
  out, how to run it, how to contribute.
- **`.gitignore`**: native folders, keystores and service-account files, caches, and personal
  Claude Code settings are kept out of git.
- Docs brought up to date (progress, phases, feature "Next" lists, setup for forks).

### Fixed — 2026-10-30 (staff filter)

- **Website, Staff**: Active / Left / All now filter as soon as you click them (they only worked
  after pressing Search).

### Fixed — 2026-10-30 (keyboard covering text boxes)

- **Both apps**: the keyboard no longer covers the box you're typing in. Forms (add expense, change
  pay, sign-in, choose password, Staffora ask and phone number) and every FinCrew sheet (advance,
  pay, pay back, reply, document name) move up above the keyboard, buttons included. Needs new
  APKs.

### Fixed — 2026-10-30 (installs and sign-out)

- **Staffora**: **Not <name>? Sign out** on the PIN screen, and "Remove from this phone" in Me is
  now called **Sign out**, so another person's sign-in can be cleared without opening it.
- **Both apps**: Android backup is off, so uninstalling and reinstalling no longer brings back the
  old sign-in. Needs new APKs.

### Changed — 2026-10-29 (salary and expenses redesign)

- **Salary in steps** (website and app): Attendance → Work out → Check & finalize → Pay, with
  the next step and its button first, the big amount to pay, how it adds up, and people grouped
  Needs a look / Ready / Still to pay / Paid. Finalize just the ready ones while others need a
  look. Website: click a person for their payslip on the side; the old table is under **Full
  table**.
- **Expenses**: Add expense and the period's spending first, then **Needs you** (shop owes staff
  with Pay back now, charged to staff, no bill photo). **Day | Month** with **List | By
  category** for either, category chips to filter, bars per day for the month.
- **Add expense in three steps** (amount & category with Save now → who paid → bill & note).
  When a staff member paid, **Give it back**: with the salary, now, or not needed.

### Added — 2026-10-29 (pay back now)

- **Pay back now**: when a staff member paid for something for the shop, give it back before
  the salary — from their staff page ("Expenses to pay back") or from the expense itself
  (website and app). The salary then won't pay it again; Undo on their ledger. Migration
  `20261029000002_reimbursement_paid.sql`.
- Opening balance: "<name> owes the shop" is now first and already selected.

### Changed — 2026-10-29 (expenses)

- **Expenses opens on today** (website and app): what was spent today in a big figure, then
  today's expenses. Go back day by day, type a date (DD/MM/YYYY) on the website, or switch to
  **Month** and **By category**.
- **Paid by** is now **Shop cash** or **Staff**; "Owner" is gone (old expenses keep it).

### Changed — 2026-10-29 (advances and expenses in the salary)

- Each staff member's **Advance rules** now choose how the salary run recovers their advance:
  **cut all of it** (new default), **cut a fixed amount each month** (the rest carries to the next
  month) or **don't cut**. Staff who had a monthly cut keep it; staff without one now have their
  whole advance cut (up to what the salary covers).
- Expenses settle in the salary: what the shop owes someone for expenses they paid is **added to
  their salary** ("Expenses paid back"), and expenses charged to them are **cut** ("Expenses
  charged"). Two switches per person in Advance rules, both on. Shown on the salary run,
  payslips and shared payslip text. Migration `20261029000001_advance_mode_expense_dues.sql`.
- After this goes live, **re-run October's salary** to include them.

### Fixed — 2026-10-29 (Staffora QR)

- Staffora **Scan QR** on Android now opens Google's QR scanner, which reads the code and checks
  in (the camera view saw the QR but never read it). The screen shows the code while checking.
- The attendance QR (website and FinCrew app) has the standard white border, so it reads faster.

### Fixed — 2026-10-26

- Salary run: "days not marked" no longer counts days that haven't happened yet.

### Added — 2026-10-26 (clear all data)

- Settings → Data (owner only): **Clear all data** empties staff, attendance, money, expenses,
  requests and documents; settings and the audit log stay. Needs your password and the shop name.

### Added — 2026-10-26 (staff documents)

- Staff page → **Documents** (website) / **Docs** (FinCrew app): keep ID proofs, bank details
  and contracts as photos or PDFs, open them, delete them. Migration
  `20261026000002_staff_documents.sql`.

### Added — 2026-10-26 (helper sign-ins)

- Helpers (managers, accountants with a role) can sign in to FinCrew: Settings → Roles →
  Helpers → Give a sign-in (email + first password). They choose their own password at the
  first sign-in; Reset password and Remove sign-in when needed. Migration
  `20261026000001_helper_logins.sql`, edge function `helper-auth`.

### Fixed — 2026-10-26

- Staffora: the camera "Allow" button on the scan screen is centred.

### Added — 2026-10-26

- Build setup for both Android apps (`eas.json`, `pnpm build:apk`, `docs/BUILDS.md`).

### Changed — 2026-10-26

- Expenses: **List** and **By category** are two views of the month (tabs next to the month),
  each full width; By category shows each category's share, count and % of the month.

### Changed — 2026-10-25 (marking attendance)

- Attendance opens on **Day**: everyone on one list with P / A / HD / PL / UL buttons; one tap
  marks and saves, and the message has Undo. Chips show and filter the day's counts; "Mark N
  present" fills everyone not marked. Month shows the grid as before.
- Saved / added / done messages now appear as toasts everywhere on the website, not as text in
  the page.

### Changed — 2026-10-25 (website page grid)

- Every page lines up on one grid: a row of figures of equal width, then sections side by side
  at equal heights (dashboard, expenses, advances, reports, salary, staff page, settings lists).

### Changed — 2026-10-25 (website look and feel)

- The website now uses shadcn/ui with the FinCrew colours, at a denser desk size.
- The sidebar stays put; only the page beside it scrolls. On a phone it slides in from the menu.
- Every click shows it's working: a bar at the top, the page fades while the next one loads,
  spinners on the section, tab or button you pressed, placeholders while sections and tabs load,
  and a message (toast) when something is saved.
- Adding and changing things opens a dialog over the page instead of forms stacked in it (staff,
  pay, advances, opening balance, expenses, categories, holidays, leave templates, roles,
  helpers). Finalizing salary asks first; paying asks how it was paid.

### Added — 2026-10-25 (FinCrew app)

- Salary run in the app: pay part of a payslip (type a smaller amount; the rest stays due), send
  the payslip on WhatsApp when paying, **Send payslip** per person and **Share payslips** for the
  whole month.
- Staff page in the app: **Undo** a salary payment or advance in the Ledger (asks first), **Change
  pay from a date** and **Advance rules** (limit, monthly cut) in the Pay tab.
- The website and the app now save pay and advance rules through the same shared code.

### Added — 2026-10-25 (app icons)

- Real app icons: FinCrew "Rupee ring" (app and website favicon), Staffora "Staff badge".

### Changed — 2026-10-25 (Staffora sign-in)

- Staff sign in to Staffora with the **phone number** saved in FinCrew and a PIN they choose
  the first time; no invite links any more (the website's join page and the invite buttons are
  gone). Forgot PIN → **Reset PIN** on the staff page. Migration
  `20261025000002_phone_login.sql`.
- Staffora can open with a **fingerprint** (Me → Open with fingerprint), if the shop allows it
  (Settings → Staff sign-in, on by default).

### Added — 2026-10-25 (Staffora)

- Staffora: change your PIN (Me → Change PIN; the current PIN is checked like a sign-in).
  Migration `20261025000001_change_pin.sql`.
- Staffora Home shows the newest payslip (net, paid, due) with Open payslip.
- Share a payslip from Staffora as text (WhatsApp, SMS, …).

### Fixed — 2026-10-25

- Website clicks took 3–5 s: the server now runs in Mumbai next to the database (`vercel.json`
  region `bom1`), a loading placeholder shows at once, and the sign-in lookup runs once per page.
- More files kept out of git (Expo folders, app builds, editor and OS files).

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
