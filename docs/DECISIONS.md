# Decisions

Choices made during the build that PLAN.md doesn't spell out. Newest first.

## 2026-10-23 — Phase 2 rule interpretations (owner to confirm)

Where PLAN §4 was silent or ambiguous, `packages/core` does this. Each is one test away from
changing; details and examples in `docs/features/core-rules.md`.

1. **Rounding:** exact fractions inside a calculation; each payslip line rounded to the rupee once.
2. **Holiday on a weekly off** counts as the holiday (its paid flag wins).
3. **Working a paid weekly off/holiday** = the off day's pay + an extra day (2 days' pay) when the
   extra-working-day setting is on; working an unpaid one = 1 day.
4. **Unmarked working days** are unpaid and make the salary run warn.
5. **Sandwich rule** triggers only on `absent` (not unpaid leave or half day) on the nearest
   working day each side; looks across month edges; an unmarked side doesn't trigger it.
6. **Leave year:** `resetMonth` is the last month of the leave year; lapse/payout happens at its end.
7. **Leave earned** is the full monthly allotment even in a partial first or last month.
8. **Late half-day conversions don't use up a free late day.** Early leaving shares the same count
   and threshold. The month uses the staff late-policy override in effect at month end.
9. **Allowances and fixed deductions** are paid for the share of employed days they cover;
   prorated ones by payable days within that, capped at the full share.
10. **Leave payout and late charges for hourly staff** use hourly rate × shift length as the day rate.
11. **Advance cut is a payslip line, not a ledger line.** The advance is on the ledger when given;
    the smaller payment recovers it. Posting a cut line as well would count it twice.
12. **Wrong-code lockout** runs 10 minutes from the 5th wrong code in 10 minutes; attempts while
    locked don't count as wrong.
13. **Payslip lines carry kinds and names, not text**, so the apps translate them (i18n rule).

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
- **Keep-awake** calls a harmless `ping()` RPC every 3 days from GitHub Actions.
- **Placeholder look**: a neutral theme with CSS variables until the design phase (Phase 3).
