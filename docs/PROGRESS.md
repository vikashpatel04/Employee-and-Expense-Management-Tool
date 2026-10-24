# Progress

_Last updated: 2026-10-24_

## Start here (handover for a new session)

**Where we are:** Phases 1–3 done; Phase 4 (FinCrew website) in progress — data layer live,
screens slices 1–9 done and checked in the browser: app shell + shop switcher, staff list/add,
staff detail (overview, ledger, pay, edit details, allowances/deductions, opening balance, own
rules, leave template), attendance grid (+ clear a mark, CSV), salary run, printable payslip,
advances + undo, settings
(holidays, leave templates + assignment, shop rules, roles & permissions). Local `main` may be ahead of
GitHub: run `git status -sb`; the owner pushes (never push unless asked).

**Next work, in order** (owner said "continue"; pick the top unfinished one):

1. ~~Advances on the web~~ — done (slice 5).
2. ~~Settings screens~~ — done (slices 6–7: holidays, leave templates + assignment, shop rules,
   roles & permissions).
3. ~~Staff detail extras~~ — done (slice 8). Still open there: attendance calendar tab,
   Staffora invite (Phase 7), adding non-staff helpers for roles.
4. ~~Payslip print/PDF, attendance CSV, clear an attendance mark~~ — done (slice 9).
5. **Web dashboard** (`(app)/page.tsx` is still a placeholder): today's attendance (marked /
   not marked / late), money due to staff, advances to recover, this month's salary status, with
   links into each screen. That closes Phase 4; then Phase 5 (Android), 6 (expenses),
   7 (Staffora).

**Waiting on the owner:**

- Whether to **finalize/pay Test Staff's October draft** on the live shop to test end to end.
  Ledger lines are permanent, so Test Staff (person `55e7a159-1a4b-4615-a1a3-bdbbcdc6b304`)
  could never be deleted afterwards. Until then it's deletable (people delete cascades; drafts
  have no ledger lines).
- Review rule defaults (`docs/features/core-rules.md`), leaked-password protection (Supabase Auth).
- Create the shop's real **leave templates** (Settings → Leave templates) and move staff onto
  them, and save **Settings → Pay & attendance rules** once (it stores the full rule set). Not done
  for the owner: templates can't be deleted (only archived), so names and rules are their call.

**Owner rules (also in CLAUDE.md and memory):** no co-author on commits; owner pushes; docs in
every commit; every rule is a setting (no hard-coding); dates DD/MM/YYYY everywhere; all strings
via i18n; design follows the Claude Design system (`docs/DESIGN.md`).

**How to check work:**

- Tests/types/build: `pnpm test` (core 225, ui 6, i18n 1, db 90 — PGlite, no Docker), `pnpm typecheck`,
  `pnpm build`, `pnpm ui:tokens --check`, `bash scripts/check-migrations.sh origin/main HEAD`.
- Live DB (CLI is logged in): `pnpm exec supabase db query --linked --project-ref
ufmlqvvfznemghmnvynz "<sql>"`; advisors: `pnpm exec supabase db advisors --linked --project-ref
ufmlqvvfznemghmnvynz --type all`. To test as the owner inside SQL: `begin; select
set_config('request.jwt.claim.sub', (select auth_user_id::text from public.people where is_owner
limit 1), true); set local role authenticated; … rollback;`
- Browser: `.claude/launch.json` → preview "fincrew-web" on :3000 (or a dev server the owner
  started). Signed-in pages need the **owner to sign in** in the pane (never type their password).
- After a pushed migration: watch CI (`gh run list`), then `pnpm db:types` and commit types.

**Gotchas seen this session:**

- Windows dev server sometimes keeps a **stale server bundle** after edits (client updates, SSR
  doesn't → hydration mismatch). Fix: stop the preview, `rm -rf apps/fincrew-web/.next`, start.
  Stale `.next/types` after moving routes breaks `tsc`: delete `.next`.
- HTML `pattern` is compiled with the **`v` flag**: no unescaped `/` in `[...]`; write patterns
  with `String.raw` (see `dateFieldProps` in `apps/fincrew-web/src/app/components.tsx`).
- Postgres **jsonb reorders keys**: compare stored JSON with `sameJson` (`src/lib/salary-month.ts`).
- Anything exported from a `'use server'` file is a callable endpoint: keep helpers in `src/lib`.
- Composite FKs mean cross-shop rows fail with `foreign key`; unique `(staff_id, effective_from)`
  on dated tables.
- New public SQL functions must be added to `supabase/tests/functions.test.ts`'s pinned list.
- Design canvases: read with the Artifact tool; read `project/canvas.json` + files before editing;
  a newer version may exist (re-read before publishing).

**Key links:** FinCrew screens https://claude.ai/artifact/WydRUvQzCNMAoXcNVh7pWC · Staffora screens
https://claude.ai/artifact/9YMxty5q9jFvuut8ay8dTe · Design system
https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP · Website https://fincrew-web.vercel.app

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                                                                                                                                                                        |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation                   | **Done** (2026-10-23)                                                                                                                                                                                         |
| 2   | Core logic (`packages/core`) | **Done**: 225 tests, every rule a setting; `docs/features/core-rules.md`                                                                                                                                      |
| 3   | Design                       | **Done** (2026-10-23): design system, key screens (owner reviewed), `packages/ui` tokens                                                                                                                      |
| 4   | FinCrew web core             | **In progress**: data layer live; 4.3 screens: slices 1–9 done and checked (shell, staff, staff detail + extras, attendance grid + CSV, salary run, payslip print, advances, settings, roles); dashboard left |
| 5   | FinCrew Android              | Not started                                                                                                                                                                                                   |
| 6   | Expenses                     | Not started                                                                                                                                                                                                   |
| 7   | Staffora                     | Not started                                                                                                                                                                                                   |
| 8   | Polish                       | Not started                                                                                                                                                                                                   |

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
(storage), `requests` (leave/advance requests), expense tables (Phase 6), `attendance_codes`,
`attendance_scans`, `invites`, `pin_credentials`, `push_tokens` (Phase 7).

## Session log

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
