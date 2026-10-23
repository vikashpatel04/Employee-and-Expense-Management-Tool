# Progress

_Last updated: 2026-10-23_

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                       |
| --- | ---------------------------- | ------------------------------------------------------------ |
| 1   | Foundation                   | **Code done — needs your accounts** (see "Waiting on owner") |
| 2   | Core logic (`packages/core`) | Not started (money + date helpers already in)                |
| 3   | Design                       | Not started                                                  |
| 4   | FinCrew web core             | Not started                                                  |
| 5   | FinCrew Android              | Not started                                                  |
| 6   | Expenses                     | Not started                                                  |
| 7   | Staffora                     | Not started                                                  |
| 8   | Polish                       | Not started                                                  |

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
- [x] FinCrew web (Next.js 16): email+password sign-in, first-run "Set up your shop", home page,
      sign-out, session refresh in `src/proxy.ts`
- [x] Supabase `config.toml` with public sign-ups disabled
- [x] GitHub Actions: `ci.yml` (migration immutability check, typecheck, test, build, then
      **migrate** job applying migrations to the live project on push to `main`) and
      `keep-awake.yml` (pings every 3 days)
- [x] Root scripts: `pnpm db:login`, `pnpm db:types` (no local link or DB password needed)
- [ ] **Waiting on owner** — accounts only you can create (steps in `docs/SETUP.md`):
  - [ ] Create the Supabase project (sign-ups off), access token
  - [ ] Create the GitHub repo, add the 5 secrets, push `main` → migrate job applies foundation
  - [ ] Verify live DB (tables, RLS, permissions, anon blocked)
  - [ ] Create your owner login in Supabase Auth; sign in locally; run shop setup
  - [ ] Import the repo in Vercel (root `apps/fincrew-web`), set env vars
  - [ ] `pnpm db:types`, then remove the cast in `apps/fincrew-web/src/lib/session.ts`

Verified locally: `pnpm typecheck`, `pnpm test` (42 tests), `pnpm build`; sign-in page renders and
`/` redirects to `/login` when signed out. **Not yet verified against a real Supabase project.**

## Migrations applied to the live project

None yet. Migrations are applied by the CI **migrate** job on every push to `main`, so
**everything in `supabase/migrations/` on `main` counts as applied** and must never change
(CI enforces this). `20261022000001_foundation.sql` becomes applied with the first push.

## Next up

Phase 2 — `packages/core`, tests first from PLAN §4: leave templates + carry-over, sandwich rule,
attendance → payable days, salary (monthly / daily / hourly, mid-month pay changes), late policy,
ledger balance. No UI.

Remaining tables from PLAN §5 (staff, pay_settings, attendance, ledger_entries, …) are added with
the phase that first uses them (mostly Phase 4), each with RLS tests.

## Session log

- **2026-10-23** — Migrations auto-apply from GitHub Actions after CI passes; CI blocks edits to
  applied migrations; Supabase CLI moved to repo root (`db:login`, `db:types`); SETUP rewritten
  for the GitHub-first order.
- **2026-10-22** — Phase 1 scaffold: monorepo, foundation migration + RLS tests, web sign-in and
  shop setup, CI and keep-awake, docs.
