# FinCrew + Staffora

Open-source staff, salary and expense management for a small shop (or several). Attendance,
leave, payroll, advances and expenses in one place, built for Indian shops: money in rupees and
paise, dates in IST, DD/MM/YYYY everywhere. Runs on free tiers (Supabase, Vercel, Expo).

- **FinCrew** — for the owner and anyone they give access to. A website and an Android app.
- **Staffora** — for staff. An Android app: check in by code or QR, see attendance, money and
  payslips, ask for leave or an advance.

Live website (sign-in only): https://fincrew-web.vercel.app

## What it does

| Area       | What you get                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Staff      | Staff list, pay (monthly / daily / hourly), allowances, deductions, leave templates, documents, per-person rules   |
| Attendance | Day roster with one tap per person, month grid, CSV, staff self check-in by shop code or QR, late / half-day rules |
| Leave      | Paid and unpaid leave by template, requests from Staffora, staff with no leave at all                              |
| Salary     | Monthly run in steps (attendance → work out → finalize → pay), part payments, printable and WhatsApp payslips      |
| Advances   | Give advances with limits, cut them from salary by rule, staff ask from their phone                                |
| Expenses   | Day / month views, by category, bill photos, paid by shop or staff, pay staff back now or with the salary          |
| Roles      | Owner, custom roles with permission keys, helper sign-ins; every table guarded by row-level security               |
| Settings   | Every business rule is a setting with a default (shop-wide, per leave template or per staff member)                |

## How it is built

```
apps/
  fincrew-web/       Next.js website (shadcn/ui), deployed on Vercel
  fincrew-mobile/    FinCrew Android app (Expo)
  staffora-mobile/   Staffora Android app (Expo)
packages/
  core/              Pure TypeScript business rules (salary, leave, attendance, money) with tests
  data/              Shared data layer: Supabase rows → core → screen data (website and apps)
  db/                Database types generated from the live schema
  i18n/              All UI strings (English now)
  ui/                Design tokens shared by the website and the apps
supabase/
  migrations/        Schema, row-level security and SQL functions (applied by CI on push to main)
  functions/         Edge functions (staff and helper sign-in)
  tests/             Database and security tests on PGlite (no Docker)
docs/                Plan, progress, decisions, feature docs, setup and build guides
```

Turborepo + pnpm · Next.js · Expo (React Native) · Supabase (Postgres, RLS, auth, storage, edge
functions) · Vitest · i18next.

## Run it locally

Needs Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test        # business rules + database security tests (PGlite, no Docker)
pnpm typecheck
pnpm --filter @fincrew/web dev
```

To use it for real you need your own free Supabase project, Vercel project and (for the Android
apps) Expo account. Follow [docs/SETUP.md](docs/SETUP.md) step by step; Android builds are in
[docs/BUILDS.md](docs/BUILDS.md). Each app has a `.env.example` listing the two public values it
needs (Supabase URL and publishable key). Secret keys never go in the apps, Vercel or GitHub.

## Docs

- [Progress](docs/PROGRESS.md) — where the build is and what's next (start here)
- [Plan](docs/PLAN.md) — the full brief: rules, data model, build order
- [Decisions](docs/DECISIONS.md) · [Changelog](docs/CHANGELOG.md) · [Features](docs/features/)
- [Design](docs/DESIGN.md) — the design system and screen designs
- [Setup](docs/SETUP.md) · [Android builds](docs/BUILDS.md) · [Another computer](docs/NEW-MACHINE.md)

## Contributing

Issues and pull requests are welcome. The house rules are in [CLAUDE.md](CLAUDE.md); the short
version:

- Money is integer paise; business dates are Asia/Kolkata `YYYY-MM-DD`; shown dates are DD/MM/YYYY.
- Business rules live in `packages/core` with tests first, and are settings, not constants.
- Schema changes only as new files in `supabase/migrations/`, each table with RLS and tests.
- All UI strings go through `packages/i18n`.
- Every change updates the docs (`docs/PROGRESS.md`, `docs/CHANGELOG.md` and the feature doc).

## Licence

[MIT](LICENSE)
