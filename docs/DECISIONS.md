# Decisions

Choices made during the build that PLAN.md doesn't spell out. Newest first.

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
- **Keep-awake** calls a harmless `ping()` RPC every 3 days from GitHub Actions.
- **Placeholder look**: a neutral theme with CSS variables until the design phase (Phase 3).
