# Progress

_Last updated: 2026-10-23_

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                   |
| --- | ---------------------------- | -------------------------------------------------------- |
| 1   | Foundation                   | **Live DB migrated — finishing owner setup** (see below) |
| 2   | Core logic (`packages/core`) | Not started (money + date helpers already in)            |
| 3   | Design                       | Not started                                              |
| 4   | FinCrew web core             | Not started                                              |
| 5   | FinCrew Android              | Not started                                              |
| 6   | Expenses                     | Not started                                              |
| 7   | Staffora                     | Not started                                              |
| 8   | Polish                       | Not started                                              |

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
- [ ] **Waiting on owner** — accounts only you can create (steps in `docs/SETUP.md`):
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
  - [ ] Import the repo in Vercel (root `apps/fincrew-web`), set env vars
  - [x] `pnpm db:types` (real types committed), cast removed from `session.ts`

Verified: `pnpm typecheck`, `pnpm test` (49 tests), `pnpm build`; end-to-end sign-in and shop
setup against the live project (2026-10-23).

## Migrations applied to the live project

| Migration                             | Applied    | How                             |
| ------------------------------------- | ---------- | ------------------------------- |
| `20261022000001_foundation.sql`       | 2026-10-23 | CI migrate job, run 39898016456 |
| `20261023000001_harden_functions.sql` | 2026-10-23 | CI migrate job, run 39901338816 |

Migrations are applied by the CI **migrate** job on every push to `main`, so **everything in
`supabase/migrations/` on `main` counts as applied** and must never change (CI enforces this).

GitHub repo: https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool
Supabase project: `employee-expense-management`, ref `ufmlqvvfznemghmnvynz` (Mumbai). The ref
lives in the git-ignored root `.env` for `pnpm db:types`.

## Next up

1. **Vercel** (owner, ~5 min): import repo, root `apps/fincrew-web`, two env vars, then set the
   Site URL in Supabase Auth. Closes Phase 1.
2. **Phase 2** (below).

Open items (low priority, fold into the next migration that touches these tables):

- Advisor performance notes: `multiple_permissive_policies` on `roles`, `role_permissions`,
  `person_roles` (the `*_write` "for all" policy overlaps `*_read` on SELECT; split it into
  insert/update/delete); `unindexed_foreign_keys` on `audit_log.actor_id`,
  `person_roles.role_id/shop_id`, `role_permissions.permission_key/shop_id`.
- GitHub Actions warn that `actions/checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`,
  `supabase/setup-cli@v1` run on deprecated Node 20; bump when newer majors are available.
- Leaked-password protection in Supabase Auth: owner's call (may need a paid plan).

Phase 2 — `packages/core`, tests first from PLAN §4: leave templates + carry-over, sandwich rule,
attendance → payable days, salary (monthly / daily / hourly, mid-month pay changes), late policy,
ledger balance. No UI.

Remaining tables from PLAN §5 (staff, pay_settings, attendance, ledger_entries, …) are added with
the phase that first uses them (mostly Phase 4), each with RLS tests.

## Session log

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
