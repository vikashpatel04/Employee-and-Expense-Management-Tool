# Progress

_Last updated: 2026-10-23_

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                                                                                                     |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Foundation                   | **Done** (2026-10-23)                                                                                                                      |
| 2   | Core logic (`packages/core`) | **Done** (2026-10-23): 201 tests, every rule a setting; `docs/features/core-rules.md`                                                      |
| 3   | Design                       | **Design system v1 done** in Claude Design (`docs/DESIGN.md`); key screens + `packages/ui` to do                                           |
| 4   | FinCrew web core             | **In progress**: data layer live; 4.3 screens: slices 1–4 (shell, staff, staff detail + pay, attendance grid, salary run) done and checked |
| 5   | FinCrew Android              | Not started                                                                                                                                |
| 6   | Expenses                     | Not started                                                                                                                                |
| 7   | Staffora                     | Not started                                                                                                                                |
| 8   | Polish                       | Not started                                                                                                                                |

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

**Phase 4 plan:** 4.1 data layer (staff, pay, leave, holidays, attendance) ✅ live → 4.2 money
(advances, ledger append-only, salary runs + payslips, leave balances) ✅ live → 4.3 web
screens on the design system (needs `packages/ui` from Phase 3) → settings screen for every rule.

**Multi-shop:** live (2026-10-23). Backend verified on the live DB; the switcher UI shows once
you belong to 2+ shops.

**Owner:** review the defaults in the settings reference (`docs/features/core-rules.md`); every
rule is changeable, so this only decides what a new shop starts with. Phase 4 needs a settings
screen for them.

**Phase 3 (Design) remainder:** key screens as Design artifacts on the design system, then
`packages/ui` generated from its `tokens.json` (`docs/DESIGN.md`). **Phase 4 (FinCrew web core)**
can start in parallel on the data side: tables for staff, pay settings, leave templates,
holidays, attendance, advances, ledger, salary runs, payslips, each with RLS tests, using
`packages/core` for every calculation.

Open items (low priority, fold into the next migration that touches these tables):

- GitHub Actions warn that `actions/checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`,
  `supabase/setup-cli@v1` run on deprecated Node 20; bump when newer majors are available.
- Leaked-password protection in Supabase Auth: owner's call (may need a paid plan).

Tables still to add (with the phase that uses them, each with RLS tests): `staff_documents`
(storage), `requests` (leave/advance requests), expense tables (Phase 6), `attendance_codes`,
`attendance_scans`, `invites`, `pin_credentials`, `push_tokens` (Phase 7).

## Session log

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
