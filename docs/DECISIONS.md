# Decisions

Choices made during the build that PLAN.md doesn't spell out. Newest first.

## 2026-10-30 — Salary is live until finalized (no "work out" step)

- Owner: "work-out from admin is simply useless… attendance = pay − advance and expense. With
  Not Finalized Yet tag it can be changed, once finalized it gets the Finalized tag and next
  month begins, once marked paid it's paid and staff see 0."
- `loadSalaryRun` now works out everyone without a finalized payslip live (`computeMonth`, the
  same rules as before) every time the page opens; they are `draft` = **Not finalized yet**.
  Nothing is written until **Finalize**: `finalizeSalary(year, month, staffIds)` saves their
  draft (created or updated in place) and finalizes it in one step. `runSalary` is gone.
- **Finalized is final**: a person with a finalized payslip is never worked out again, so the
  "new revision after finalizing" path (re-run adjustments) is no longer reachable from the
  apps. The database and core still support revisions if a correction flow is wanted later.
- A live row's `id` is the staff id until finalized, then the payslip id; screens key and link
  people by `staffId` (`?person=<staff id>` on the website).
- `month_running` warning (screen hint, not saved): the month isn't over and the person hasn't
  left, so they sit in "Needs a look" and Finalize-ready skips them; one person can still be
  finalized from their row. It's a fact (days still to come), not a shop rule, so no setting.
- A month with no salary run and no attendance marked (before the shop used FinCrew) shows
  nobody ("No salary"), so the app's last-4-months list doesn't invent figures from weekly offs.
- Live data on 30/10/2026: October had 3 drafts and nothing finalized, so nothing changes for
  it: the drafts are overwritten when October is finalized.

## 2026-10-30 — Staffora Money: money now

- Total = ledger balance + salary so far (gross − deductions) of each month not finalized yet:
  advances and expenses are already on the ledger, so they count once (core `moneyNow`, tested).
  Finalized salary not paid yet = balance + advance − expenses to get back + expenses charged.
- Months counted live: this month, and last month while it has marked days and no finalized
  payslip of mine (staff can't see drafts or other people's runs; "has marked days" keeps
  months from before the shop used FinCrew out).
- Not a new screen (the Money card gains rows), so no new artboard; it follows the card's
  existing pattern.

## 2026-10-30 — Requests: no duplicate leave; reject after approving

- Leave on a day that is already in a waiting or approved leave request, or already marked as
  leave, is refused (`askRequest` → `duplicate`, and `private.guard_request` on insert,
  `unique_violation`). The owner asked for it; it is a fact about the days, not a setting.
- Approved → rejected is allowed for `requests.decide` (`rejectApprovedRequest`): leave days
  still marked with the approved status are cleared (others changed since are left alone); the
  advance is undone with an exact reversal (needs `salary.undo_payment`), refused once the
  outstanding advance is less than it (part already cut from salary). The database refuses to
  reject an approved advance request whose advance isn't undone. Rejected stays final.
- Migration `20261030000001_requests_reject_later_no_duplicates.sql`.

## 2026-10-30 — Staffora QR: Play Store query

- expo-camera 58 decides "Google Play Services is not available" by looking up the Play Store
  package (`com.android.vending`). Since Android 11 that lookup fails unless the manifest lists
  the package under `<queries>`, so Google's scanner never opened (owner's Samsung S21 FE).
  `plugins/play-store-query.js` adds the entry at build time. If the scanner still fails, the
  screen falls back to the in-view camera (with the camera permission).

## 2026-10-30 — Keyboard: react-native-keyboard-controller

- Owner: "the keyboard itself overlaps text box when the content is below… happens everywhere".
  Cause: the apps are edge-to-edge (Expo SDK 58 / React Native 0.88), where Android no longer
  shrinks the screen for the keyboard, and React Native's `KeyboardAvoidingView` was set to do
  nothing on Android.
- Fix: `react-native-keyboard-controller` (1.22.7, Expo's version for SDK 58): `KeyboardProvider`
  at the root of both apps and its `KeyboardAvoidingView` (`behavior="padding"`) around each form
  with text boxes, with the scroll and the bottom buttons inside so both move up. FinCrew's
  `Sheet` wraps its content the same way, so every sheet is covered; its `Modal` is edge-to-edge
  too (`statusBarTranslucent`, `navigationBarTranslucent`).
- New screens with text boxes: put the scroll and its BottomBar inside that
  `KeyboardAvoidingView`, or use a `Sheet`.

## 2026-10-30 — Android backup off; sign out from the PIN screen

- Owner: after uninstalling and reinstalling, Staffora still opened on the old account with no
  way out. Cause: Android Auto Backup restored the app's storage (profile, session, phone id).
  Both apps now set `allowBackup: false`; a reinstall starts clean.
- The phone id is still a random id kept in app storage (not the Android id), so a reinstall
  counts as a new phone: the shop taps **New phone** (as for a changed phone). Kept on purpose,
  so a reinstall can't skip the shop's say.
- The PIN screen gets **Not <name>? Sign out** (it was only in Me, which needs the PIN), and the
  Me button is called **Sign out**.

## 2026-10-29 — Salary and expenses redesign (owner)

- **Most important first** (owner: "design in the thought of what is priority"): salary leads with
  the next step and the amount to pay; expenses with Add expense and the period's total, then
  what needs the owner (money owed to staff, missing bills). Detail (the full salary table, a
  payslip, categories) is one click away.
- **Finalize the ready ones**: while some payslips need a look (a warning), the main button
  finalizes only the drafts without warnings; the rest stay drafts. With no warnings it
  finalizes everyone.
- **Categories are a way of showing a period**, not a third view (owner): Day | Month and List |
  By category are separate switches.
- **Give it back "now" when adding**: saves the expense, then records the pay-back the same way
  as Pay back now (a separate `reimbursement_paid` line, not linked to the expense, see below).
  Only for a new expense and with `salary.run`. If the pay-back fails the expense stays saved and
  the screen says so (no second save that would duplicate it).
- **Website still uses Intl for month names** on Salary and Expenses (as before); dates shown
  are DD/MM/YYYY.

## 2026-10-29 — Pay back now (owner)

- **A pay-back is a ledger line, not tied to one expense** (`reimbursement_paid`): the expenses
  trigger reverses every line pointing at an expense when it is edited, so a pay-back linked to
  the expense would silently vanish on an edit. Opening it from an expense only pre-fills the
  amount. It needs `salary.run` (paying staff money, like a salary payment) and can't exceed
  what the shop owes for expenses.
- **Opening balance starts on "<name> owes the shop"**: old advances are the usual case.

## 2026-10-29 — Expenses page and Paid by (owner)

- **Paid by is the shop or a staff member**: the owner's money is the shop's cash, so "Owner" is
  gone from new expenses (website and app). The database still allows `owner` so old expenses
  keep it and show it when edited.
- **Expenses open on the day**: the big figure is everything spent that day (shop + charged to
  staff + not tracked), because it answers "how much went out today"; the split is under it.
  The date filter is a typed DD/MM/YYYY box (no browser date picker, house date rule).

## 2026-10-29 — Advances and expenses settled in the salary (owner)

- **The advance comes off the salary automatically, set per staff member** (owner: "should be in
  the settings of staff alone"): mode `all` (default), `fixed` (monthly cut, the rest carries to
  next month) or `none`. Existing staff with a monthly cut became `fixed`; those without one
  (which used to mean "no cut") became `all`. No per-run override.
- **Expenses in the salary are two per-staff switches, both on**: pay back what the shop owes
  them (staff-paid expenses with "pay them back") and cut what is charged to them. The owner
  floated a separate "pay back" entry too; not built — the salary settles it, and the switch
  can be turned off for someone who is paid back another way. Add a pay-back entry if asked.
- **Pay-back and charges are not netted**: each has its own payslip line (Expenses paid back /
  Expenses charged), so the payslip shows both. The pay-back is added before the cuts, so it can
  cover an advance cut; nothing takes net pay below zero; what doesn't fit carries.

## 2026-10-24 — Staffora app

- **Its own app** (`apps/staffora-mobile`, `@fincrew/staffora`), set up like FinCrew's. The small
  UI kit (`ui.tsx`, `sheet.tsx`, theme helper) is **copied** rather than shared: each app keeps
  its own palette and app-only helpers (CLAUDE.md), and the kit is small. Move it to a shared
  package if it grows.
- **PIN on every open** (PLAN §6.3): the app keeps who it belongs to on the phone, but not opened;
  each open signs in again through `staff-auth` with the PIN, so a lost-and-unlocked phone still
  needs the PIN. "Lock" signs out locally; "Remove from this phone" forgets the profile.
- The phone id is a random id kept on the phone (no hardware ids); clearing app data needs the
  shop to free the phone ("New phone") and a new link.
- The "check out from" time on the Checked-in screen uses the shop's own minimum gap.

## 2026-10-24 — Owner's answers

- Leaked-password protection stays off: the project is open source and self-hosted (owner).
- Phone installs (EAS, Expo account) wait until the apps are fully complete (owner).
- Test Staff's October salary may be finalized and paid on the live shop to test salary end to
  end (owner); other permanent test writes still need asking.

## 2026-10-24 — Phase 7 data (codes, requests, sign-in)

- **Attendance codes are stored as digits, not hashed** (PLAN §4.5 said hashed). Hashing a
  6-digit code protects nothing (all million can be tried in a moment), and the owner must be
  able to see today's code at any time. Instead the table has no API access at all; only
  `attendance_code()` (needs `attendance.code`) shows it and `check_in()` compares it.
- **Check-in runs in the database** (`check_in`, security definer) rather than an edge function:
  one transaction with row locks, testable on PGlite like everything else, deployed with the
  migrations. The rules mirror core `evaluateCheck`, and a test runs the same attempts through
  both. A check-in on a day marked something else (absent, leave) makes it present: the person
  is at the shop with today's code.
- **The first accepted check-in binds the phone** when none is bound yet (normally the first
  PIN binds it), so "reset phone" followed by the next check-in or sign-in moves the binding.
- **Request approvals happen in the apps' shared code**, not a database function: approving
  leave reuses `writeAttendance` (paid leave within the balance) and approving an advance reuses
  `recordAdvance` (limit check), then the request records the result. Future leave days are
  written ahead; the screens show them once the day comes.
- **Staffora sign-in is phone number + PIN, no invite links** (owner, 2026-10-25: "no staff is
  going to self on-board"; the owner creates the staff with their number). The number the shop
  saved is the user id; the first time, the person types it in Staffora and chooses a PIN, which
  ties Staffora to that phone; afterwards number (remembered) + PIN. Forgot → owner taps Reset
  PIN, the person chooses a new one on their bound phone (the owner never knows it). Accepted by
  the owner: whoever types a staff member's number first sets their PIN, so a coworker who knows
  the number could take it before them; FinCrew shows "Signed in" vs "Not set up yet", and
  Reset PIN + New phone undo it. A number on two active staff is refused (`many`). This
  replaces the invite entries below (migration `20261025000002_phone_login.sql`).
- **Fingerprint opening** (`staffLogin.allowBiometrics`, default on) is the person's choice in
  Me. It reuses the session kept on the phone instead of a PIN sign-in, then checks the person is
  still active on this phone and the shop still allows it.
- (Superseded 2026-10-25) **PIN sign-in**: the edge function only turns an accepted invite / PIN into a session; all
  rules live in SQL (`invite_accept`, `pin_login`), mirrored by core `evaluatePinAttempt`. Each
  staff sign-in is a normal Supabase user with a server-only email and **no stored password**:
  a fresh random password is set right before each sign-in. A new invite for someone who
  already signed in resets their PIN on the same sign-in (that's how a forgotten PIN is reset).
- Wrong phone, or a person who has left, is refused before the PIN is checked, and doesn't count
  as a wrong PIN (someone else's phone can't lock a person out).
- The PIN wait / lock numbers are shop settings (`staffLogin`, defaults 5 / 15 min / 10 from
  PLAN §10; the invite lifetime went with the links), like every other rule. The PIN is always 4 digits.
- (Superseded 2026-10-25) Invites could be made for any non-owner person (staff or helper).
- (Superseded 2026-10-25) **Invite links opened the website** (`/join/<token>`, public) which hands over to the Staffora
  app with the `staffora://join/<token>` scheme. A plain https link works in WhatsApp and on any
  phone; the page explains what to do if the app isn't there. The link is shown once when made
  (only its hash is stored); "New link" makes another.
- **QR codes are drawn by the apps** from the `qrcode` library (website SVG on the server,
  react-native-svg in the app) — no image service, the content is just the 6 digits.
- Copying the code is on the website only for now (the app would need a clipboard library);
  the app shows the QR full screen instead.

## 2026-10-24 — Android Money tab

- **Saving moved to `@fincrew/data`** before building the screens: `saveExpense` /
  `deleteExpense` (`expense-write.ts`), `runSalary` / `finalizeSalary` / `paySalary` /
  `loadSalaryRun` / `loadPayslipsDue` (`salary-run.ts`), `recordAdvance` / `undoLedgerLine` /
  `loadAdvanceBalances` (`advances.ts`). They take typed text (rupees, DD/MM/YYYY), check the
  permission and return reason codes; each app turns them into its own messages. Website server
  actions are now thin wrappers.
- A new expense's id is made by the caller (`newId`: Node's `randomUUID` on the website,
  `expo-crypto` in the app) because the bill file is named after it before the row exists.
- Phone bill photos are shrunk with `expo-image-manipulator` (JPEG, smaller widths/quality until
  ≤ 200 KB) and uploaded as bytes (base64 decoded in `src/lib/bill-photo.ts`, no extra library).
  The camera button is hidden in the browser preview (gallery only there).
- **Finalize and pay ask first** in the app (a sheet with what will happen, and the payment
  mode): both write permanent ledger lines.
- Staff detail **Pay** pays every finalized month still due for that person, oldest first (one
  `paySalary` per payslip). Paying part of a payslip isn't supported yet (website neither).
- Days are picked with a ‹ › day stepper (no future days) rather than a calendar picker: no
  extra native library, and most entries are today or a few days back.
- Money segments follow the website's permissions; a person with none of them sees a short note.

## 2026-10-24 — Android Staff tab

- Staff detail data comes from shared loaders (`loadStaffOverview`, `loadLedger`, `loadPay`);
  the website's staff page still has its own queries (same tables and columns) — move it onto
  these loaders when it is next touched.
- On the phone, Pay is read-only for now; pay changes, allowances and own rules stay on the
  website until the app has forms for them.

## 2026-10-24 — Android app foundations

- **Expo SDK 58 with Expo Router**, created from Expo's default template and trimmed. pnpm's
  default isolated installs work (Expo supports them since SDK 54); Metro needs no monorepo
  config. The app keeps Expo's TypeScript 6; the rest of the repo stays on 5.9.
- **Business rules that lived in website server actions moved to `@fincrew/data`** so the app
  can't skip them: `writeAttendance` (future days, past days need `attendance.edit_past`, paid
  leave within balance, clear = delete) and session loading. Each app turns the shared result
  codes into its own wording.
- The app talks to Supabase directly with the **publishable key**; RLS is the security
  boundary, exactly as for the website. The session is stored with AsyncStorage.
- **Checking the app without Android tools**: the same screens run in a browser via Expo web
  (`pnpm --filter @fincrew/mobile web`) at phone size. Real builds go through EAS later (owner's
  Expo account). Android package id `app.fincrew.mobile` is a placeholder until then.
- Tabs not built yet (Staff, Money) say "Coming next" and point to the website.

## 2026-10-24 — Shared data package (start of Phase 5)

- **`packages/data`** (`@fincrew/data`) holds the data loading that turns Supabase rows into
  what screens show, using `packages/core` rules: mappers, attendance month, dashboard,
  expenses, reports, salary month, leave setup, roles. It takes any `SupabaseClient<Database>`
  (`Supabase` type), so the website's server client and the Android app's client run the same
  code. Moved from `apps/fincrew-web/src/lib` with history. UI-only helpers (i18n, format,
  icons, CSV) stay in each app.

## 2026-10-24 — Website extras

- **Helpers** are `people` rows with no `staff` row (needs `staff.edit`, like adding staff).
  They hold roles like anyone else; they can sign in once invites exist (Phase 7). Removing one
  deletes the person (their roles go with them); staff and the owner can't be removed there.
- **Opening balance corrections** are `adjustment` ledger lines (`ref_table = 'ledger_entries'`,
  `ref_id` = the opening line, dated like it) for the difference; the opening line itself never
  changes. Needs `salary.run` (the ledger insert rule for adjustments).
- **Reports** use only what the person may see: salary columns need `salary.view`, advances
  `salary.view` or `advances.give`, expenses `expenses.view_all`. Salary = gross on each month's
  latest payslips, drafts included and tagged. Undone payments/advances are left out.
- **Advance to recover ignores undone advances**: `private.advance_outstanding` skips advances
  whose ledger line has a reversal (migration `20261024000002_advance_undo.sql`).
- Staff detail Attendance calendar starts weeks on **Monday** (as designed); the grid and Day
  view keep day order.

## 2026-10-24 — Expenses

- **Ledger lines come from a trigger**, like advances: the app can't write `staff_charge` or
  `reimbursement` lines directly. Editing an expense reverses the lines it posted and posts new
  ones (reversals dated the day of the change), so the ledger stays append-only and the
  history shows what changed. Edits that move no money (note, category, mode, bill) post nothing.
- **Expenses can be deleted** (with `expenses.edit`); their ledger lines are reversed, and the
  audit log keeps the row.
- **Who sees an expense**: `expenses.view_all`, its author, and the staff member it is paid by
  or charged to (it's on their ledger). Only `expenses.edit` changes one, the author included.
- **Bill photos**: private bucket `bills`, path `<shop>/<expense>-<time>.jpg` (a new photo gets
  a new path, then the old file is removed). The browser shrinks photos to about 200 KB before
  sending; the server refuses anything over 1 MB or not an image. Viewing is a one-minute
  signed link. Storage read rule: your own upload (uploads read their row back) or a bill an
  expense you can see points at.
- **Category colours** reuse the status colour tokens (both themes) under neutral keys
  (`teal`, `green`, … `slate`): the design system has no category palette yet (DESIGN gap).
- **No default categories in the database**: an empty shop offers "Add the usual ones" (nine
  suggestions from i18n), so nothing is assumed and names stay translatable.
- **Expenses CSV** follows the attendance CSV (BOM, DD/MM/YYYY, `reports.export`).
- `packages/db` types for the two tables were written by hand until the migration was live;
  `pnpm db:types` replaced them after the push (2026-10-24).

## 2026-10-24 — Small screens

- The website switches layout at Tailwind `md` (768 px): below it the sidebar folds into a top
  bar with a Menu button, and Attendance opens in a Day view (one row per person) because a
  31-day grid can't fit; the Month grid is one tap away. At `md` and up the grid shows, with
  the name column and the totals pinned (`position: sticky`) so only the days scroll.
- Switching day or view clears the selection, so "Set to" never acts on days you can't see.
- Expenses come before the Android app (owner's call), as Phase 6 then Phase 5.

## 2026-10-24 — Dashboard

- Designed in Claude Design first (owner's request), on the FinCrew key screens canvas next to
  the other web artboards, then built to match.
- Each part appears only with its permission: today's attendance needs `staff.view` (Mark today
  present also `attendance.mark`), Due to staff and the salary card `salary.view`, Advances
  `salary.view` or `advances.give`; holidays show to everyone, leaving dates need `staff.view`.
- "Present" on the dashboard counts half days too; lateness comes from the same core rules as
  the grid (`loadAttendanceMonth` now also returns each cell's check-in and minutes late).
- The design's "Attendance code" button is left out on the web until the code exists
  (Phase 7 edge function); the Android Today screen gets it in Phase 5.

## 2026-10-24 — Payslip print, CSV, clearing marks

- **Payslip PDF = the browser's "Save as PDF"** from a print-ready page (`/payslips/[id]`), not
  a server PDF library: no new dependency, same layout on screen and paper. `payslips.pdf_path`
  stays unused until Staffora needs stored files (Phase 7). While printing, the page switches to
  the light theme (`beforeprint`) so dark mode can't print light text on white paper.
- The payslip page is outside the app shell (no sidebar to hide) and relies on RLS: people see
  their own finalized payslips, `salary.view` sees all, anything else is "not found".
- **Attendance CSV** is wide (one row per person, one column per day) like the grid, UTF-8 with a
  BOM so Excel shows names and ₹ correctly, and needs `reports.export` (PLAN §3: reports export).
  Days after today are blank; status words are the app's own labels.
- **Clearing a mark deletes the attendance row**, so the day falls back to what the rules give
  (not marked, weekly off or holiday). Same permission and past/future checks as setting one.

## 2026-10-24 — Staff detail extras

- **Leaving date sets the status**: any leaving date (even a future one) marks the person `left`
  (the staff list's Left filter); clearing it makes them `active`. Attendance and salary already
  use the leaving date itself, so pay stops after that day either way.
- **Opening balance is set once**: the ledger allows one `opening_balance` line per person and is
  append-only, so the form needs a confirmation tick and disappears once set (the Overview shows
  the line instead). Correcting one later needs a ledger adjustment screen (not built).
- **Own rules live on pay settings** (`pay_rules_override` / `late_policy_override`), so they are
  dated like pay: saving from a date starts a copy of the pay in effect then (or updates the
  version starting that day) and applies to every later version too. Changing pay from a date
  copies the own rules of the version it follows, so they're never dropped silently. A choice
  left on "Shop's rule" is simply not stored and follows Settings.
- **Allowances and deductions**: "End today" sets the end date (past months keep them);
  "Remove" (two clicks) deletes one added by mistake. Finalized payslips keep their own lines.
- Changing someone's leave template from the Pay tab is the same dated assignment as Settings →
  Leave templates → Move staff (`staff.edit`); archived templates aren't offered.

## 2026-10-24 — Roles screen

- Permission and area names shown on screen come from i18n (`permissions.*`,
  `permissionAreas.*`), not the database `permissions.description`, so they translate later. A
  test in `packages/i18n` fails if a key in core `PERMISSIONS` has no label.
- The owner isn't offered roles (they hold every permission); the screen says so.
- Saving a role's permissions or people makes them exactly what's ticked (delete the unticked,
  add the new). Saving people only touches people the editor can see (RLS on `people` needs
  `staff.view`), so it never removes someone hidden from them; without `staff.view` the people
  list isn't shown.
- People without a login can be given a role; it takes effect when they sign in (Staffora invite,
  later). Non-staff helpers (a manager not on payroll) need a way to be added first: later.
- Deleting a role is two clicks ("Delete role", then "Yes, delete this role"); its permissions
  and people go with it (cascade).
- `settings.roles` can grant any permission, including to themselves: the label says so.

## 2026-10-24 — Settings screens

- **Who can change what**: holidays and leave templates need `settings.leave_templates` (as the
  RLS policies already say); moving staff onto a template needs `staff.edit` (assignments are part
  of a person's setup); shop rules need `settings.shop`, because they live in `shops.settings` and
  only that permission may update the shop row. `settings.attendance` has no screen of its own yet;
  splitting late/code rules out for it would need a database function (later, if a shop wants it).
- **Shop rules are saved whole**: the form writes the full `ShopRules` into `shops.settings`
  (other keys kept), so later changes to code defaults never change a shop's rules silently.
  Until the first save, the defaults from `resolveShopRules` apply.
- **A new leave template starts blank** (no weekly offs, 0 paid leave, lapse, full month,
  sandwich off): nothing is assumed. Templates can't be deleted (no delete policy; old payslips
  were worked out with them), only archived; an archived template can't take new staff.
- **No "no template" assignment**: assignments always name a template. To take someone off leave
  from a date, move them to a template with no weekly offs and 0 paid leave.
- **A holiday on a date that already has one replaces it** (upsert on shop + date).
- **Forms submit through `useFormAction`** (`src/lib/use-form-action.ts`), not `<form action>`:
  React 19 resets a form after its action, which wiped what was typed whenever a save was refused.
- **Client components may import `t`** from `@/lib/i18n` (i18next initialises synchronously with
  the bundled English strings); the settings forms do, instead of passing every label as a prop.
- Settings screens have no Claude Design artboards yet; they reuse the system's web patterns
  (cards, segmented controls, lists) from the existing screens.

## 2026-10-23 — Salary run screen

- The website works out payslips with `packages/core` on the server (`computeMonth`) and stores
  them as drafts; the database's `finalize_payslip` posts the ledger. Same inputs as the
  attendance grid, so the grid's Days and the payslip agree.
- Running again: drafts are updated in place; finalized payslips get a new revision only when
  their lines or advance cut changed. Staff who no longer qualify keep any old draft (rare; delete
  by hand for now).
- Paying is per finalized payslip for whatever is left of net pay; "Pay everyone" uses one mode.
  Partial payments and undo-payment screens come later (the database already supports both).
- "Print payslips" from the design isn't built yet (PDF later).

## 2026-10-23 — Attendance grid

- The grid computes everything with `packages/core` on the server (same inputs the salary run
  will use, via `packages/data/src/mappers.ts`), so a cell, the Days total and the payslip can't disagree.
- Days/Late/Absent count **up to today** in the current month (future paid offs aren't counted).
- Paid-leave balance for the check: opening = the previous month's `leave_balances.carried`
  (written when that month's salary is finalized; 0 before any finalized month) + this month's
  `earnedLeave`. Clearing a mark (back to unmarked) isn't offered yet; set another status.

## 2026-10-23 — Dates are DD/MM/YYYY everywhere (owner's rule)

- Every date shown or typed in FinCrew and Staffora is **DD/MM/YYYY** (23/10/2026). It overrides
  the design system's voice rule ("Fri, 23 Oct"). Stored dates stay ISO `YYYY-MM-DD`.
- `packages/core`: `formatDisplayDate`, `parseDisplayDate` (also accepts 5/1/2026, 05-01-2026,
  05.01.2026; rejects impossible dates). Apps never format dates with Intl/locale functions.
- Date fields are DD/MM/YYYY **text fields**, not browser date pickers, because pickers follow
  the browser's language (US browsers would show MM/DD/YYYY). A calendar picker that keeps
  DD/MM/YYYY can come later.
- Month headings ("October 2026") are months, not dates, and keep the month name.
- Amounts typed by people go through `parseRupees` (exact, no floats).

## 2026-10-23 — Attendance code shows a QR (owner review)

- **FinCrew shows the code as a QR itself** ("Show QR" on the Attendance code screen, a
  full-screen QR view for the counter that keeps the screen on), replacing PLAN §4.5's "the
  system only gives a code; I make my own QR". Asked for in the owner's comment on the key
  screens. The QR's content is still the plain 6-digit code, so `parseScannedCode` and any
  other QR generator keep working. "Copy code" is gone from that screen.

## 2026-10-23 — Phase 4.2 money data

- **The app calculates, the database posts.** Payslips are computed by `packages/core` and saved
  as drafts; `finalize_payslip` posts ledger lines _from the saved payslip_, so the ledger always
  matches what the payslip says. Nobody can write `salary_earned`/`deduction`/`late_deduction`
  lines directly.
- **Re-runs are revisions.** A new payslip for the same run and person becomes the next revision
  (only after the previous one is final; one draft at a time). Finalizing posts the differences
  as `adjustment` lines with `adjusts` = the corrected type, dated the day of the re-run.
- **Advances live in their own table** (given / repaid) and each row posts its ledger line by
  trigger. Cash repaid is a positive `advance` line. Outstanding = given − repaid − cuts on the
  latest final payslip revisions.
- **The advance limit is enforced by the database**: over the limit is refused unless the row says
  `over_limit_confirmed` (the app's confirmation step).
- **Monthly advance cut is a staff setting** (`staff.advance_cut_paise`, null = decide at each run),
  in keeping with "no hard-coded rules".
- **Payments are capped** at the payslip's net pay (net of reversals); undo needs
  `salary.undo_payment` and works for any line (exact opposite, once).
- **Sign rules per ledger type** are database checks (e.g. payments negative, earned positive).
- Advisor fixes folded in: `people_read` uses `(select auth.uid())`; composite FKs from 4.1 got
  covering indexes.

## 2026-10-23 — Phase 4.1 data model

- **Composite foreign keys for shop safety:** child rows reference `(shop_id, staff_id)`,
  `(shop_id, template_id)` etc., so cross-shop links are impossible in the database, not just
  blocked by policy.
- **Late minutes aren't stored** on attendance (PLAN §5 listed `late_minutes`): `packages/core`
  computes them from check-in and the shift in effect, so they can't go stale.
- **Staff rows can't be deleted**; people leave via `leaving_date` / `status = 'left'`, which
  keeps history and the ledger intact.
- **Holidays** are managed with `settings.leave_templates` (no separate permission in PLAN §3).
- **Template assignment** is part of staff setup, so it needs `staff.edit`.
- **Attendance by date:** `attendance.mark` covers today and later; earlier days also need
  `attendance.edit_past` (IST "today" from `private.today_ist()`). Staff can't mark themselves
  through the API; self check-in will go through an edge function.
- Template version rule fields (`carry_over`, `sandwich`, `accrual`, `weekly_offs`) are jsonb in
  `packages/core`'s shapes, with defaults matching core's defaults; the app validates them with
  core before writing. Staff overrides of late policy and pay rules are jsonb on pay settings.
- Hourly "hours per day" is stored as `day_minutes` (integer).

## 2026-10-23 — Multi-shop

Owner asked for multi-shop options (PLAN originally said one shop).

- **One login, many shops.** A login has one `people` row per shop it belongs to, each with its
  own name, roles and owner flag (`unique (shop_id, auth_user_id)`). An owner can run several
  branches; a supervisor can be a supervisor in one and plain staff in another.
- **Every check is per shop.** RLS helpers take the row's shop:
  `private.has_permission(shop_id, key)`, `private.is_owner(shop_id)`, `private.is_member(shop_id)`,
  `private.person_id(shop_id)`. There is no "current shop" in the database; the apps pick one
  (website: `fincrew_shop` cookie, falling back to the first shop) and RLS still decides access.
- **Creating shops:** `create_shop(name, owner_name)` replaces `setup_shop`. On a fresh install
  anyone signed in can create the first shop (first-run setup); after that only someone who owns
  a shop can add one, and becomes its owner. Public sign-ups stay off.
- **Everything else is per shop:** settings (`shops.settings`), leave templates, roles, holidays,
  staff and money. Copying settings/templates between shops and cross-shop reports come later.
- `my_permissions(p_shop)` now takes the shop.
- Rewriting the policies also split the overlapping "for all" write policies into
  insert/update/delete and added the missing foreign-key indexes (advisor notes).

## 2026-10-23 — No hard-coded rules: everything is a setting

Owner's instruction: every value is customisable by the admin, and staff may have no leave.

- **Every business rule is a setting** with a default (`packages/core/src/settings.ts`,
  `LatePolicy`, leave template versions, `CodeSettings`). The full list with options and
  defaults is the settings reference in `docs/features/core-rules.md`. The engine never decides a
  rule on its own; adding a rule means adding a setting.
- **Three levels:** shop-wide (`shops.settings` → `resolveShopRules`), per leave template version
  (leave, weekly offs, sandwich, accrual), and per staff member (pay settings may override any pay
  rule or late-policy field for that person).
- **Staff with no leave** are supported two ways: no template (no weekly offs, no paid leave, bank
  lapses, paid leave can't be marked) or a template with 0 paid leaves and/or no weekly offs.
- **Defaults** keep the earlier Phase 2 interpretations, now changeable: holiday wins over a weekly
  off; working an off day pays the off day plus an extra day; unmarked days unpaid (with a
  warning); sandwich only on `absent`, both sides, weekly offs only; full leave accrual;
  half-day conversion doesn't use a free late day; late minutes counted from shift start, charged
  per minute; day rate = salary ÷ days in the month; lockout 5 wrong codes / 10 min / 10 min wait.
- **Fixed by design, not settings:** integer paise and one rounding per payslip line (PLAN §4.1);
  IST dates; append-only ledger; advance cut never makes net pay negative; the advance cut is a
  payslip line, not a ledger line (the advance is already on the ledger when given; a cut line
  would count it twice); payslip lines carry kinds and names, not text (i18n).
- `resetMonth` is the LAST month of the leave year; lapse or payout happens at its end.
- A month uses the staff overrides in effect on its last day of employment.

## 2026-10-23 — Design lives in Claude Design

- **All UI design is kept in Claude Design**, as one Design System artifact (tokens, brand book,
  components, icons), with key screens to follow as Design artifacts built on it. Link and how
  to read it: `docs/DESIGN.md`.
- **`tokens.json` in that artifact is the source of truth for tokens**; `packages/ui` is
  generated from it in Phase 3, never hand-edited to diverge.
- **Money logic stays in `packages/core`**: the design system's `formatPaise` is a preview
  helper; app code formats money with `packages/core`.
- Accents: FinCrew "Peacock" (cool petrol), Staffora "Marigold" (warm yellow). Fonts: Anek
  Latin / Tamil / Devanagari, one design across the three scripts.

## 2026-10-23 — Function exposure (security advisor)

- **Internal functions live in a `private` schema** that PostgREST doesn't expose:
  `current_person_id`, `current_shop_id`, `is_owner`, `has_permission` and the trigger functions.
  Only functions the apps call live in `public` (`my_permissions`, `setup_shop`, `shop_exists`,
  `ping`); a test pins that list.
- **New functions get no execute grant for anon/PUBLIC by default** (default privileges changed).
  Each migration grants what it needs explicitly. Policy helpers must be granted to
  `authenticated`, because RLS runs as the signed-in user.
- **Remaining advisor warnings are accepted:** `authenticated` can call `my_permissions`,
  `setup_shop`, `shop_exists` (intended; they guard themselves) and the private helpers (needed
  by RLS, not reachable over the API). `rls_auto_enable` is Supabase's own event-trigger function
  for auto-enabling RLS; left alone. Leaked-password protection is an Auth dashboard setting
  (may need a paid plan); owner chooses.
- **The shop's audit row has no actor**: `setup_shop` inserts the shop before the owner's person
  row exists. The owner row right after it carries the actor.

## 2026-10-23 — Live project checks

- ~~Helper functions stay callable by anonymous users~~ — superseded the same day by the
  `private` schema move above.
- **Generated `packages/db/src/database.types.ts` is committed and excluded from Prettier**, so
  regenerating only shows real schema changes in diffs.

## 2026-10-23 — Migrations deploy from GitHub

- **Migrations apply automatically** from the `migrate` job in `.github/workflows/ci.yml` on
  push to `main`, only after the migration check, typecheck, tests and build pass. Chosen over
  Supabase's own GitHub integration so the RLS tests gate every deploy.
  _Revisited 2026-10-23, kept:_ the integration deploys on push regardless of CI, so it only keeps
  that gate if every change goes through a PR with branch protection. The owner pushes straight
  to `main`, so the Actions job stays. Switch only together with a PR workflow; never run both.
- **Everything on `main` in `supabase/migrations/` is treated as applied and immutable.**
  `scripts/check-migrations.sh` fails CI if one is modified, deleted or renamed, or if a new
  file's timestamp sorts before the newest existing one. Fix mistakes with a new migration.
- CI runs on `main` are never cancelled mid-way (a migration may be running); branch runs are.
- Shows a `--dry-run` of pending migrations before applying, so the Actions log records what ran.
- **No local link / DB password needed.** `pnpm db:types` uses the project ref and the CLI login.
  The DB password lives only in GitHub secrets (and your password manager).

## 2026-10-22 — Phase 1

- **Owner bootstrap via `setup_shop()`.** The first signed-in user creates the shop and becomes
  owner; it refuses once any shop exists. Public sign-ups are off, so only logins you create in
  Supabase can reach it. Owner rows can only be inserted while `setup_shop` sets the
  `fincrew.bootstrap` flag.
- **Owner protection lives in a trigger**, not just policies: the owner can't be deleted or demoted,
  nobody can be promoted, people can't move shops.
- **`shop_id` duplicated on `role_permissions` and `person_roles`** so policies stay simple
  (`shop_id = current_shop_id()`); a trigger checks it matches the role/person.
- **RLS helpers are `SECURITY DEFINER` with `search_path = ''`**, so policies call them without
  recursive RLS and without search-path hijacking.
- **Audit log** is written by a `SECURITY DEFINER` trigger; users have no insert/update/delete
  grant, and a trigger rejects UPDATE/DELETE even for the database owner (append-only).
- **Permission keys** are dotted strings (`staff.pay.edit`) in a `permissions` table, mirrored in
  `packages/core/src/permissions.ts`; a test fails if they drift.
- **DB tests run on PGlite** with a small stub of Supabase's `auth` schema and API roles, because
  Docker isn't available on the dev machine. Tests switch to the `authenticated` role with a JWT
  subject, as PostgREST does.
- **Tables arrive with the phase that uses them**, not all at once, so each lands with its RLS tests.
- **TypeScript 5.9**, not 7: Next.js and Expo tooling still expect the JS compiler API.
- **Workspace packages ship TS source** (no build step); Next transpiles them via
  `transpilePackages`, Expo/Metro will too.
- **Next.js 16 `proxy.ts`** (formerly middleware) refreshes the Supabase session and redirects
  signed-out users. Server code uses `auth.getClaims()` (verifies the JWT), never `getSession()`.
- **Change PIN is a plain RPC, not a `staff-auth` action.** The staff member already has a
  Supabase session, so `public.change_pin` (authenticated, own person only) does it in the
  database and reuses `pin_login_at` for the current PIN, so wrong PINs share the sign-in's
  wait / lock. The edge function stays for the steps that need the service role (invite,
  accept, PIN sign-in).
- **Payslip share text lives in `packages/data`** (`payslipShareText`, takes the app's `t`), so
  Staffora and FinCrew send the same words.
- **Website on shadcn/ui, themed by our tokens** (owner, 2026-10-25: "use shadcn everywhere with
  our theme"). shadcn's colour names are mapped onto the FinCrew tokens in `globals.css`
  instead of a second palette, so dark mode and brand colours stay in one place; shadcn's own
  variables are not defined because its `--accent` would clash with our teal `--accent`.
- **The website has its own, denser scale.** The design tokens are sized for phones (48 px
  taps, 20 px corners); on the website the same token names get desk sizes in `globals.css`.
  The phone apps are unchanged.
- **Clear all data keeps setup and the audit log, and lifts the append-only guards only inside
  one owner-only function** (transaction flag `fincrew.clearing`, never for `audit_log`); the
  website also asks for the password and the shop name.
- **Staff documents are named freely** (suggestions, not a fixed list: no hard-coded kinds), read
  with staff.view or by the person, changed with staff.edit, and deleted for real (not money
  records). Files up to 4 MB because the website uploads through a Vercel function (4.5 MB
  request limit); photos are shrunk to ~600 KB first.
- **Helpers sign in with email + a first password the shop gives** (owner chose email +
  password, 2026-10-26). No invite emails: Supabase's built-in mailer only delivers to the
  project's own team, so the shop tells the helper the first password and the helper chooses
  their own at the first sign-in (`must_change_password`). Reset works like Staffora's Reset
  PIN. A sign-in used in several shops is the person's own: it can be linked or unlinked, not
  reset, by one shop.
- **Only the server changes who a person signs in as** (`private.guard_login_link`): before,
  RLS let anyone with staff.edit write `people.auth_user_id`.
- **Phase 8 is only import / export** (owner, 2026-10-26): no home-screen widgets, no Tamil /
  Hindi, no offline attendance marking, no StaffBook import.
- **App builds read the Supabase keys from EAS environment variables**, not from the repo: the
  `.env.local` files stay out of git; `eas.json` profiles name the EAS environment (`preview` /
  `production`). Steps in `docs/BUILDS.md`.
- **Attendance is marked from a day roster** (owner, 2026-10-25: "like PagarBook"): one tap per
  person saves straight away, with Undo in the toast, instead of select-then-set. The month
  grid stays as the second view for looking back and for marking many days at once.
- **Confirmations are toasts, never text in the page** (owner, 2026-10-25). Successes from
  forms (`useDialogDone`), action buttons (requests, attendance code, sign-in card, grid, mark
  today) and redirects (`UrlToast` reads `?added=` / `?saved=`, toasts once and removes the
  parameter) all go through sonner. Errors from buttons are error toasts; a form's own error
  stays next to the form so it can be fixed there.
- **One page grid for the website**: figures in a `StatGrid` (auto-fit columns, so 2, 3 or 4
  figures always fill the row evenly), sections in a 12-column `Bento` whose panels stretch to
  the tallest in the row. Pairs of lists (allowances / deductions) are always shown, with
  "None yet", so rows stay aligned instead of a column collapsing.
- **Tasks open in dialogs; pages show lists and numbers** (owner: "a task should be in modal").
  `FormDialog` closes on the action's `done` or on a redirect; redirects that close a dialog
  carry a changing value so saving the same thing twice still closes it.
- **Every click shows it's working** (owner: "no loading … I see nothing happening"): a top bar
  and a faded content area while a link loads, spinners on the sidebar item / tab being opened,
  skeletons for new sections and tabs (`<Suspense key={tab}>`), spinners on busy buttons via
  `aria-busy`, toasts for results.
- **shadcn's CSS helper is copied, not installed**: the `shadcn` package (a CLI with many
  dependencies) was only needed for one small CSS file, now `src/app/shadcn-tailwind.css`.
- **Paying part of a payslip is in the app's pay sheet** (design "Salary run · pay one" has the
  amount field). `paySalary` takes an optional `amount` for one payslip; the database trigger
  already refuses paying more than net pay, so several part payments add up safely. "Pay all
  due" always pays what's left in full. The website still pays in full only.
- **WhatsApp payslips open `wa.me/91<number>?text=…`** with the person's saved phone number
  (core `phoneKey`, so any way it was typed works), straight into their chat with the text
  filled in; the owner taps send. No phone number → the phone's share sheet. Several payslips
  can't go in one step, so "Share payslips" is a list with a Send button per person.
- **Pay and advance-rule saving moved into `packages/data`** (`savePay`,
  `saveAdvanceSettings`, taking the fields as typed like `recordAdvance`), so the website and the
  app check them the same way; the website actions only map the reasons to messages.
- **App icons are generated, not hand-exported**: the chosen design-system SVGs live in
  `packages/ui/design/app-icons/` and `pnpm ui:icons` makes every size, so a new icon is one SVG
  change. Android adaptive marks are scaled to 80% so they stay inside the safe zone; the
  monochrome (themed) icon turns the ground colour inside the mark into holes.
- **Website server region is Mumbai (`bom1`)**, set in `apps/fincrew-web/vercel.json`, because
  the Supabase project is in `ap-south-1`. Server pages make several database trips per click;
  Vercel's default (`iad1`, Washington) made each one cross the world. A new database region
  means changing this too.
- **Keep-awake** calls a harmless `ping()` RPC every 3 days from GitHub Actions.
- **Placeholder look**: a neutral theme with CSS variables until the design phase (Phase 3).
