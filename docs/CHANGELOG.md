# Changelog

## Unreleased

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
