# Progress

_Last updated: 2026-10-24_

## Start here (handover for a new session)

_Handover written 2026-10-24 before a session compaction. Read this section first, then
`CLAUDE.md`, then the feature doc for whatever you touch._

**Where we are**

- Phases 1–4 done; **Phase 6 Expenses done on the website** (live); website extras done (staff
  Attendance tab, helpers, opening balance correction, Reports). The website covers every owner
  flow in PLAN §6.2 except requests and the attendance code (both need Phase 7 data).
- **Phase 5 FinCrew Android in progress** (`apps/fincrew-mobile`, Expo SDK 58 + Expo Router,
  `docs/features/fincrew-mobile.md`): sign-in, shop switch, tabs Today · Staff · Money · More.
  **Today** and **Staff** (list + detail Overview / Attendance / Ledger / Pay) are built and were
  **checked with the owner signed in on live data** (2026-10-24). **Money** tab is the
  "Coming next" placeholder; More has the website link + sign out.
- Shared code: `packages/core` (rules), **`packages/data`** (Supabase rows → core → screen data,
  used by website and app: attendance month, write attendance, paid-leave check, session,
  dashboard, expenses, reports, salary month, leave setup, roles, staff loaders).
- **Git:** local `main` is **2 commits ahead** of GitHub (`092ffe8` Staff tab, `42c0c73` checked +
  Mark-all confirmation). Not pushed. The owner pushes, or tells you to push in that moment.
  Everything before that is pushed; CI green; Vercel deployed; migrations up to
  `20261024000002_advance_undo.sql` are live.

**Next work, in order** (owner usually says "continue"; pick the top unfinished one)

1. **Android Money tab** (PLAN §6.1: segment Expenses · Salary · Advances), following the
   Android "Salary run" / "Add expense" artboards on the FinCrew canvas:
   - **Expenses**: month totals by category, list, add/edit (amount first, category grid, paid by,
     charged to, mode, note, bill photo). Reuse `loadExpenseMonth` / `toExpense`. The website's
     save logic is in `apps/fincrew-web/src/app/(app)/expenses/actions.ts` (server action) — move
     the shared part (validation, bill path, insert/update, old-bill removal) into
     `@fincrew/data` first, like `writeAttendance`, so the app can't skip rules. Photos: pick or
     take with an Expo library (install with `npx expo install`), shrink to ~200 KB, upload to the
     `bills` bucket at `<shop>/<expense>-<time>.jpg`.
   - **Salary**: month picker, work out → draft review → finalize → pay all / pay one. The logic
     is in the website's `salary/actions.ts` (`runSalary`, `finalizeSalary`, `paySalary`) using
     `computeMonth` from `@fincrew/data` — move the run/finalize/pay steps into `@fincrew/data`
     first, then call them from both apps. Payslip share on WhatsApp can come later.
   - **Advances**: outstanding by person (`advance_balances`), give / record repaid with the
     over-limit confirm (DB hint `over_limit`), like `staff/[id]/advance-actions.ts`.
   - Then the staff detail quick actions in the app (Give advance, Pay) using the same code.
2. Move the website's staff detail page onto the shared loaders (`loadStaffOverview`,
   `loadLedger`, `loadPay`) when it's next touched.
3. **Phase 7 data the Android app also needs**: attendance codes (table + edge function, code
   screen with QR / regenerate), invites + PIN logins (staff and helpers), requests (leave /
   advance) — then the FinCrew code screen and requests banner, then the Staffora app.
4. Push notifications (expo-notifications + `push_tokens`), EAS build (owner's Expo account;
   Android package id `app.fincrew.mobile` is a placeholder), Phase 8 polish (widgets,
   translations, offline marking, StaffBook import, backup).

**Waiting on the owner**

- Whether to **finalize/pay Test Staff's October draft** on the live shop to test salary end to
  end. Ledger lines are permanent, so Test Staff (person `55e7a159-1a4b-4615-a1a3-bdbbcdc6b304`)
  could never be deleted afterwards. Never do it without their OK.
- Their real setup: leave templates (Settings → Leave templates), save Settings → Pay &
  attendance rules once, expense categories ("Add the usual ones").
- Review rule defaults (`docs/features/core-rules.md`); leaked-password protection in Supabase
  Auth; an Expo account for EAS when the app is ready to install.

**Live test data (keep it reversible)**: Test Staff (joined 23/10/2026, ₹22,000 monthly,
9:30 AM – 8:30 PM, advance limit ₹5,000 / cut ₹1,000, attendance 23/10 half day, October draft
payslip ₹355, no ledger lines); an archived "Test category". Everything else tested was reverted.

**Owner rules (also in CLAUDE.md and memory)**: no co-author on commits; the owner pushes (push
only when asked in that moment); docs in every commit; every rule is a setting (no
hard-coding); dates DD/MM/YYYY everywhere; all strings via i18n (no English fallbacks in code);
design in Claude Design first for new screens (`docs/DESIGN.md`); never type the owner's
password; never write permanent ledger lines or advances on the live shop without their OK.

**How to check work**

- `pnpm typecheck` (8 tasks incl. the app), `pnpm test` (core 225, ui 6, i18n 1, db 109 —
  PGlite, no Docker), `pnpm build`, `pnpm ui:tokens --check`,
  `bash scripts/check-migrations.sh origin/main HEAD`.
- Live DB (CLI logged in): `pnpm exec supabase db query --linked --project-ref
ufmlqvvfznemghmnvynz "<sql>"`; advisors: `... db advisors --linked --project-ref
ufmlqvvfznemghmnvynz --type all` (accepted warnings only: authenticated-callable
  `create_shop`/`finalize_payslip`/`my_permissions`/`shop_exists`, Supabase's
  `rls_auto_enable`, leaked-password protection). **Dry-run a new migration** on live before
  asking to push: write `begin; <migration> select 'applied'; rollback;` to a file and run
  `... db query --linked --project-ref ufmlqvvfznemghmnvynz -f <file>`.
- Website in the browser: preview "fincrew-web" (:3000). App in the browser: preview
  "fincrew-mobile-web" (:8081, `expo start --web`; the first bundle takes ~1 min — poll with
  curl until 200). Both need the **owner to sign in** in the pane (sessions persist per origin).
  In the app, RN `accessibilityLabel` becomes `aria-label` and Pressables are `role=button`,
  so drive it with JS clicks; pane screenshots can look scaled — measure layout with JS.
- After a pushed migration: `gh run watch <id>`, then `pnpm db:types` and commit the types.
  Vercel status: `gh api repos/vikashpatel04/Employee-and-Expense-Management-Tool/commits/<sha>/status`.

**Gotchas seen so far**

- Long Bash heredocs often fail to parse in this tool: write scripts/JSON edits with the Write
  tool into the scratchpad and run them. Python on Windows writes CRLF unless
  `open(..., newline='')`. Windows sometimes locks `common.json` for a moment (EUNKNOWN): retry.
- Prettier re-pads Markdown tables: edit table rows with a regex, not exact strings.
- Next.js: stale server bundle / `.next/types` after moving routes → stop preview, delete
  `apps/fincrew-web/.next`. Don't delete `.next` while the owner's own dev server runs.
- React 19 resets `<form action>` forms after the action: use `useFormAction`
  (`src/lib/use-form-action.ts`).
- Anything exported from a `'use server'` file is a callable endpoint; server components can't
  take plain values (maps, objects) from `'use client'` files — keep those in `src/lib`.
- HTML `pattern` uses the `v` flag (`dateFieldProps` uses `String.raw`).
- jsonb reorders keys → `sameJson`. Composite FKs → cross-shop rows fail with `foreign key`.
- Hidden `sr-only` labels inside `overflow-x-auto` boxes widen phone pages → make the scroll box
  `relative`.
- New public SQL functions go in `supabase/tests/functions.test.ts`'s pinned list. Storage in
  tests: the PGlite harness has a small `storage` stand-in (buckets, objects with `owner_id`,
  `foldername`).
- Expo: add native libraries with `npx expo install` (from `apps/fincrew-mobile`); pnpm isolated
  installs work; the app keeps Expo's TypeScript 6. One React version inside the app.
- Design canvases: read with the Artifact tool (`project/canvas.json` + the artboard files),
  re-read `canvas.json` right before publishing; new artboards go in the "FinCrew web" row
  (y 2528; next free x ≈ 8070) or the Android rows.

**Key links**: FinCrew screens https://claude.ai/artifact/WydRUvQzCNMAoXcNVh7pWC · Staffora
screens https://claude.ai/artifact/9YMxty5q9jFvuut8ay8dTe · Design system
https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP · Website https://fincrew-web.vercel.app ·
Repo https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool · Supabase project
ref `ufmlqvvfznemghmnvynz` (never touch `cheque-tracker-dev`).

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                                                                                                                                      |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation                   | **Done** (2026-10-23)                                                                                                                                                       |
| 2   | Core logic (`packages/core`) | **Done**: 225 tests, every rule a setting; `docs/features/core-rules.md`                                                                                                    |
| 3   | Design                       | **Done** (2026-10-23): design system, key screens (owner reviewed), `packages/ui` tokens                                                                                    |
| 4   | FinCrew web core             | **Done** (2026-10-24): data layer live; screens slices 1–10 (dashboard, shell, staff + extras, attendance grid + CSV, salary run, payslip print, advances, settings, roles) |
| 5   | FinCrew Android              | **In progress**: shell, sign-in, Today, Staff (checked live); Money next                                                                                                    |
| 6   | Expenses                     | **Done on the web** (2026-10-24), live; Android Money tab next                                                                                                              |
| 7   | Staffora                     | Not started                                                                                                                                                                 |
| 8   | Polish                       | Not started                                                                                                                                                                 |

## Phase 1 — Foundation

Done:

- [x] Turborepo + pnpm monorepo (`apps/`, `packages/`, `supabase/`), MIT licence
- [x] Packages: `core` (money in paise, ₹ Indian formatting, half-up rupee rounding, IST business
      dates, permission keys), `db` (placeholder types), `ui` (placeholder), `i18n` (i18next, English)
- [x] Migration `20261022000001_foundation.sql`: `permissions`, `shops`, `people`, `roles`,
      `role_permissions`, `person_roles`, `audit_log`; helpers `current_person_id()`,
      `current_shop_id()`, `is_owner()`, `has_permission(key)`, `my_permissions()`; RLS on all
      tables; owner protection; append-only audit log; `setup_shop()`, `shop_exists()`, `ping()`
- [x] RLS test harness on PGlite + 21 tests (owner / Supervisor role / staff / stranger / anon)
- [x] Migration `20261023000001_harden_functions.sql` (after the Supabase security advisor):
      helpers + trigger functions moved to a non-exposed `private` schema; anon can call only
      `ping()`; future functions not executable by anon/PUBLIC by default; `ping()` search_path
      fixed. 7 more tests (28 DB tests total)
- [x] FinCrew web (Next.js 16): email+password sign-in, first-run "Set up your shop", home page,
      sign-out, session refresh in `src/proxy.ts`
- [x] Supabase `config.toml` with public sign-ups disabled
- [x] GitHub Actions: `ci.yml` (migration immutability check, typecheck, test, build, then
      **migrate** job applying migrations to the live project on push to `main`) and
      `keep-awake.yml` (pings every 3 days)
- [x] Root scripts: `pnpm db:login`, `pnpm db:types` (no local link or DB password needed)
- [x] Owner accounts and live setup (steps in `docs/SETUP.md`):
  - [x] Create the Supabase project (sign-ups off), access token
  - [x] Create the GitHub repo, add the 5 secrets, push `main` → migrate job applied foundation
        (CI run 39898016456, 2026-10-23)
  - [x] Verify live DB: 7 tables + 8 functions present (from generated types); anonymous API
        calls refused on every table, insert, `setup_shop`, `shop_exists`; `ping()` answers
  - [x] Owner login created; signed in locally; shop set up ("Dhanalakshmi Textiles", owner
        Dinesh Patel). Verified in DB: 1 shop, 1 owner linked to the login, 22 permissions,
        2 audit rows, second `setup_shop` refused
  - [x] Hardening migration applied (CI run 39901338816); advisor rerun: only the accepted
        warnings remain (see DECISIONS 2026-10-23); helpers now 404 on the API; owner still
        has 22 permissions
  - [x] Vercel: https://fincrew-web.vercel.app (root `apps/fincrew-web`, 2 env vars, Supabase
        integration deliberately not added). Checked: signed-out `/` and `/setup` → 307 to
        `/login`; no secrets in any client JS chunk (Supabase is only called server-side); owner
        signed in on the live site and sees the home page; Site URL set in Supabase Auth
  - [x] `pnpm db:types` (real types committed), cast removed from `session.ts`

Verified: `pnpm typecheck`, `pnpm test` (49 tests), `pnpm build`; end-to-end sign-in and shop
setup against the live project, and sign-in on the Vercel deployment (2026-10-23).

## Migrations applied to the live project

| Migration                             | Applied    | How                             |
| ------------------------------------- | ---------- | ------------------------------- |
| `20261022000001_foundation.sql`       | 2026-10-23 | CI migrate job, run 39898016456 |
| `20261023000001_harden_functions.sql` | 2026-10-23 | CI migrate job, run 39901338816 |
| `20261023000002_multi_shop.sql`       | 2026-10-23 | CI migrate job, run 39950298454 |
| `20261023000003_staff_attendance.sql` | 2026-10-23 | CI migrate job, run 39950298454 |
| `20261023000004_money.sql`            | 2026-10-23 | CI migrate job, run 39953812217 |
| `20261023000005_add_staff.sql`        | 2026-10-23 | CI migrate job, run 39968572884 |

Migrations are applied by the CI **migrate** job on every push to `main`, so **everything in
`supabase/migrations/` on `main` counts as applied** and must never change (CI enforces this).

GitHub repo: https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool
Website: https://fincrew-web.vercel.app (Vercel, auto-deploys on push to `main`)
Supabase project: `employee-expense-management`, ref `ufmlqvvfznemghmnvynz` (Mumbai). The ref
lives in the git-ignored root `.env` for `pnpm db:types`.

## Next up

See **Start here** at the top for the ordered list.

Open items (low priority, fold into the next migration that touches these tables):

- GitHub Actions warn that `actions/checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`,
  `supabase/setup-cli@v1` run on deprecated Node 20; bump when newer majors are available.
- Leaked-password protection in Supabase Auth: owner's call (may need a paid plan).

Tables still to add (with the phase that uses them, each with RLS tests): `staff_documents`
(storage), `requests` (leave/advance requests), `attendance_codes`,
`attendance_scans`, `invites`, `pin_credentials`, `push_tokens` (Phase 7).

## Session log

- **2026-10-24** — Owner compacting the session: rewrote the **Start here** handover (state,
  next work with where the logic to move lives, live test data, checks, gotchas). Local `main`
  2 commits ahead of GitHub.

- **2026-10-24** — Owner signed in on the app (browser preview :8081). Checked Today and Staff
  with live data (details in `docs/features/fincrew-mobile.md` → Checked); all writes reverted.
  Fix: "Mark all present" now confirms even for one person.

- **2026-10-24** — Pushed `32d5d25` + `e44565e` (CI green; Vercel deployed). **Phase 5 slice B:
  Staff tab** — shared loaders `loadStaffList`, `loadStaffOverview`, `loadLedger`, `loadPay` in
  `@fincrew/data`; app Staff list (search, Active/Left/All, today's status) and staff detail
  (Overview, Attendance calendar with Change, Ledger, Pay) per the "Staff detail" design; the
  status sheet is now one shared component. Checked: typecheck/tests/build; signed-out guard.
  Not yet seen with data — needs the owner to sign in on the app.

- **2026-10-24** — **Phase 5 slice A: Android app foundations + Today.** New app
  `apps/fincrew-mobile` (Expo SDK 58, Expo Router, pnpm isolated installs, TS 6 in the app).
  Moved more shared logic into `@fincrew/data`: `loadMemberships` / `loadMe` (website session
  uses them), `paidLeaveShortfall` and `writeAttendance` (set/clear marks with the date and
  paid-leave rules; the website's attendance actions now call it). App: theme from
  `@fincrew/ui`, Anek Latin, Supabase client with the session on the phone, sign-in + guard,
  shop switch sheet, tabs Today · Staff · Money · More, Today screen per the design. Checked in
  the browser at 375 px: starts, signed-out → Sign in, matches the design. Today not yet seen
  with data (owner sign-in needed). Removed the starter's own `.claude/settings.json` (it only
  enabled an Expo plugin) and example screens.

- **2026-10-24** — Owner: "Push it and continue". Pushed `5006ace` (CI green incl. migrate; the
  advance-undo fix is live). **Phase 5 started**: moved the website's data loaders into a new
  shared package `packages/data` (`@fincrew/data`) so the Android app reuses them; website
  imports updated; typecheck, tests and build pass.

- **2026-10-24** — **Slice 13: website extras** (owner: "complete website extras so the app has
  everything it needs to refer"). Staff detail **Attendance** tab (design "Staff detail ·
  Attendance": Monday-first month calendar, chosen day's status / minutes late / in-out times,
  Change = set or clear, month counts). Settings → Roles **Helpers** (people not on the payroll:
  add with name/phone, remove; tagged "Helper" in role people lists). **Opening balance
  correction** (adjustment line for the difference, linked to the opening line, same date;
  needs `salary.run`). **Reports** (designed first, "Web · reports"): 3/6/12 months, tiles, month
  by month (salary gross incl. drafts tagged, paid to staff minus undone, advances given net of
  repaid minus undone, shop expenses, total cost) with bars, shop expenses by category × month,
  CSV; sidebar with `reports.view`. **Bug fixed:** undoing an advance reversed its ledger line
  but the outstanding advance still counted it → `private.advance_outstanding` ignores advances
  whose line was reversed (2 new DB tests; dry-run on live, rolled back). Fix: a hidden table
  label made Reports 597 px wide on phones (scroll boxes are now `relative`). Checked on the live
  shop: attendance tab mark/clear, helper add/remove, reports and CSV, phone widths; DB back to
  the one 23/10 half day and no helper. Opening correction not tried live (Test Staff has no
  opening balance; setting one is permanent).

- **2026-10-24** — Owner: "Push it". Pushed `862e1f1` (dashboard, small screens, expenses); CI
  green incl. migrate; live DB has `expenses`, `expense_categories`, private `bills` bucket with
  3 policies; advisors unchanged (only the accepted warnings). `pnpm db:types` regenerated.
  **Checked on the live shop:** added "Test category" (wrench, amber), added a ₹123.45 UPI shop
  expense with a generated bill photo (stored as a 101 KB JPEG at `<shop>/<expense>-<time>.jpg`),
  opened the bill via its signed link, CSV row, edited to ₹200 (dashboard tile followed),
  phone widths, deleted it (bill file removed; 0 expenses, 0 bill files, 0 expense ledger lines
  left). "Test category" stays **archived** (categories can't be deleted). Staff charge and
  pay-back were not tried live (they'd put permanent lines on Test Staff's ledger); the DB tests
  cover them. Fix: "Add the usual ones" also shows when every category is archived.

- **2026-10-24** — **Slice 12: expenses** — migration (categories, expenses, ledger posting
  trigger with reverse-and-repost on change, RLS, private `bills` bucket + Storage policies),
  17 DB tests (Storage stand-in added to the PGlite harness), migration dry-run on the live DB in
  a rolled-back transaction (applies cleanly; nothing kept). Web: Expenses page (tiles, by
  category, list, add/edit side panel with photo shrinking, CSV), Settings → Expense
  categories (icons, colours, archive, "Add the usual ones"), sidebar item, dashboard tile.
  Designed first ("Web · expenses"). Not yet checked against real data: the tables go live
  with the push; pages load empty without them. Expense types in `packages/db` were added by
  hand until `pnpm db:types` can run.

- **2026-10-24** — Owner: the grid's totals only show after scrolling, too much for small
  screens. **Slice 11: attendance on small screens** — designed first (desktop grid artboard
  updated with pinned columns; new "Web · attendance on a phone (day view)"), then built: names
  and Days/Late/Absent pinned while days scroll; below `md` the sidebar folds into a top bar
  with a Menu button (`nav-shell.tsx`) and Attendance opens in a **Day view** (date switcher,
  chips, one row per person with month totals and minutes late, tap to select + Set to) with a
  Day | Month switch. Checked at 1000 px (both sides stay pinned while scrolling) and 375 px
  (no sideways scroll on any page; marked and cleared Test Staff from the Day view, DB back to
  the one 23/10 half day). Next: expenses.

- **2026-10-24** — Owner asked me to push: pushed slices 1–9 (`e1cbba7`), CI green.
  **Slice 10: dashboard** — designed first as "Web · dashboard" on the FinCrew key screens
  canvas (toggles: dark, salary state, all marked), then built: greeting, Mark today present,
  today's attendance (present / absent / late / not marked chips, not-marked and came-late lists
  with check-in time and minutes late), Due to staff and Advances tiles, this month's salary
  (steps, net / paid / still to pay, next action), Coming up (holidays and leaving dates in 30
  days, salary due at month end). Checked in the browser (data matches the live shop; 1280 and
  375 px wide); marked Test Staff present from the dashboard and cleared it again. Phase 4 done.

- **2026-10-24** — **Slice 9: payslip print, attendance CSV, clear a mark** — `/payslips/[id]`:
  printable payslip outside the shell (shop, month, employee, pay period, days, earnings,
  deductions, advance cut, net, paid so far / still to pay; Draft notice), "Print or save as
  PDF" via the browser, prints in the light theme even in dark mode; linked from each person's
  row on Salary. `/attendance/export?month=YYYY-MM`: CSV (UTF-8 BOM, DD/MM/YYYY day columns,
  payable / late / absent) behind `reports.export`, "Download CSV" on Attendance. Grid toolbar
  "Not marked" clears marks (delete, same date permissions). Checked in the browser: payslip
  numbers match the run (₹355 draft), CSV bytes and content, mark + clear today (DB back to the
  one 23/10 half day). Next: web dashboard.

- **2026-10-24** — **Slice 8: staff detail extras** — Overview: Details (name, phone, joining,
  leaving date → status left/active) and one-time Opening balance (confirm tick; ledger line).
  Pay tab: allowances/deductions with End today and two-step Remove, add forms; change leave
  template from a date; **Rules just for {name}** (per-person `pay_rules_override` /
  `late_policy_override` from a date). Changing pay now carries own rules into the new version.
  Checked in the browser on Test Staff and reverted every change (DB confirmed: 1 pay row, no
  overrides, no allowances, active, 0 ledger lines). Opening balance only tested for its error
  (a real one is permanent). Next: payslip print/PDF, attendance CSV, clear a mark.

- **2026-10-24** — **Slice 7: roles & permissions** — Settings → Roles: list (permission count,
  who has it), new role (name + permissions by area), role page (permissions, people, rename,
  two-step delete). Permission labels are i18n strings; new `@fincrew/i18n` test checks every
  `PERMISSIONS` key has one. Checked in the browser on the live shop with a test role (created,
  permissions changed, given to Test Staff, renamed, deleted; DB checked at each step and left with
  0 roles). Next: staff detail extras.

- **2026-10-24** — **Slice 6: settings** — Settings in the sidebar with Holidays (by year, add /
  replace / remove, paid or not), Leave templates (list with plain-words summary and head count;
  new template; template page with rules by date, change from a date, rename, archive, move staff
  from a date) and Pay & attendance rules (every `ShopRules` field). Also fixed every website form
  losing what was typed when a save was refused (React 19 form reset): forms now submit through
  `useFormAction`. Checked in the browser: holiday add/remove (test holidays removed again),
  form validation and conditional fields; no template created and rules not saved on the live shop.
  Next: roles & permissions.

- **2026-10-23** — **Slice 5: advances** (give/repaid with limit confirmation, advance rules, undo
  in ledger, Advances page). Test Staff now has limit ₹5,000 and cut ₹1,000 (still deletable: no
  ledger lines). Next: settings screens (holidays, leave templates + assignment, shop rules, roles).

- **2026-10-23** — **Slice 4: salary run** (work out, review with lines/days/warnings, finalize,
  pay). Checked with Test Staff as a draft (₹355). Not finalized on the live shop: ledger lines
  are permanent and would make Test Staff undeletable — owner to decide. Next: advances and
  undo payment, holidays + leave templates + rule settings screens, staff extras, payslip PDF.

- **2026-10-23** — **Slice 3: attendance grid** (month view, select days + Set to, Mark today
  present, paid-leave balance check, past-day permission). Checked with Test Staff (today is now
  a half day). Next: salary run (slice 4), then advances, holidays/leave-template/settings screens.

- **2026-10-23** — add_staff live; slice 1 checked in the browser (owner signed in) and a
  **Test Staff** added on the live shop (delete when not needed). **Slice 2**: staff detail
  (overview, ledger, pay + change pay from a date). Owner rule: **dates DD/MM/YYYY everywhere**
  (core format/parse; text date fields). Next: attendance grid (slice 3), then salary run,
  advances, settings screens, staff detail extras (template assignment, allowances, invite).

- **2026-10-23** — **Phase 4.3 slice 1**: web app shell (sidebar, shop switcher, permission-aware
  sections), staff list and Add staff (`add_staff` RPC, migration 5). Built and typechecked;
  needs push + owner sign-in to check in the browser. Next slices: staff detail, attendance grid,
  salary run, settings. See `docs/features/fincrew-web.md`.

- **2026-10-23** — Owner reviewed the key screens; their comment (Show QR instead of Copy code on
  Attendance code) applied to the FinCrew canvas and recorded in DECISIONS. Website restyle
  checked in the browser, light and dark: Anek loaded, token colours, 56px primary buttons.

- **2026-10-23** — Key screens published in Claude Design (FinCrew, Staffora; see DESIGN.md).
  `packages/ui` generated from design tokens (`pnpm ui:tokens`, CI check, 6 tests); website now
  uses tokens.css + Anek Latin. Not yet visually checked in the browser; owner hasn't reviewed
  the screen designs. Next: review screens, then Phase 4.3 screens (Today, staff, salary run).

- **2026-10-23** — Money migration live (CI run 39953812217): 21 tables, all RLS; advisors show only
  the accepted warnings (FK/initplan notes fixed); DB types regenerated.

- **2026-10-23** — Pushed: multi-shop + Phase 4.1 live (CI run 39950298454); live DB checked (4
  migrations, 16 tables all RLS, owner data intact), advisors rerun, DB types regenerated.
  **Phase 4.2** migration `20261023000004_money.sql`: advances, ledger_entries (append-only),
  salary_runs, payslips (revisions), leave_balances, ledger/advance balance views,
  finalize_payslip; advisor fixes folded in. 24 money tests (87 DB tests).
  `supabase/vitest.config.ts` raises hook timeout (each file boots its own PGlite).

- **2026-10-23** — **Phase 4.1** migration `20261023000003_staff_attendance.sql`: staff, pay
  settings, allowances, fixed deductions, leave templates + versions + assignments, holidays,
  attendance; composite FKs for shop safety; RLS per PLAN §3 incl. past-day edits; audit on all.
  21 new DB tests (63 total). Feature doc `docs/features/staff-attendance-data.md`.

- **2026-10-23** — **Multi-shop.** Migration `20261023000002_multi_shop.sql`: one `people` row per
  (shop, login), shop-scoped RLS helpers, `create_shop` (first run, or owners adding shops),
  `my_permissions(p_shop)`, write policies split, FK indexes. 14 multi-shop tests (42 DB tests).
  Website: current shop cookie, shop switcher, `/shops/new`. DB types hand-updated for the new
  functions until `pnpm db:types` after the push.

- **2026-10-23** — Owner asked for no hard-coded rules and support for staff with no leave. Added
  `settings.ts` (shop rules, defaults, per-staff overrides, validation); every Phase 2
  interpretation is now a setting (day-rate basis, off-day work, unmarked days, holiday vs
  weekly off, marks on off days, sandwich triggers/sides/applies-to, leave accrual, late count
  start, half-day threshold on/off, free-day use, fixed per-day late charge, lockout values,
  hourly hours per day). No-template staff supported. 201 core tests.

- **2026-10-23** — **Phase 2 done.** `packages/core`: exact fractions (`rational`), dates,
  effective-dated versions, leave templates + carry-over, attendance → payable days + sandwich
  rule, late policy, salary (monthly/daily/hourly, mid-month changes, overtime, allowances,
  leave payout, deductions, advance cut), ledger (reversals, re-run adjustments, advances),
  expenses, attendance-code rules. 154 core tests, written test-first. 13 interpretations
  recorded in DECISIONS for the owner.

- **2026-10-23** — Design system v1 created in Claude Design by a separate session
  ("FinCrew Design System", https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP); recorded in
  `docs/DESIGN.md`. Verified the artifact reads (README, index, 75 files).

- **2026-10-23** — FinCrew web deployed to Vercel and verified; owner signed in on the live site.
  **Phase 1 done.**

- **2026-10-23** — Hardening migration live; advisor rechecked; DB types regenerated (helpers no
  longer in `public`). Open items listed under "Next up".

- **2026-10-23** — Owner login + shop setup done against the live project and verified in the DB
  (`supabase db query --linked --project-ref …`). Security advisor run → hardening migration
  `20261023000001_harden_functions.sql` (not yet pushed). Live checks use the CLI login only.

- **2026-10-23** — Live DB verified from outside (schema via generated types, anonymous access
  refused via REST). Real DB types generated; `db-types.mjs` validates the ref.
- **2026-10-23** — Repo on GitHub; secrets set; first CI migrate run applied the foundation
  migration to the live project. (First run before secrets existed stopped safely at "Check
  secrets".)
- **2026-10-23** — Migrations auto-apply from GitHub Actions after CI passes; CI blocks edits to
  applied migrations; Supabase CLI moved to repo root (`db:login`, `db:types`); SETUP rewritten
  for the GitHub-first order.
- **2026-10-22** — Phase 1 scaffold: monorepo, foundation migration + RLS tests, web sign-in and
  shop setup, CI and keep-awake, docs.
