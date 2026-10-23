# FinCrew + Staffora

Staff, salary and expense management for a small shop. Open source (MIT), self-hosted on free
tiers. Successor to StaffBook.

- **FinCrew** — management app (website + Android) for the owner and anyone given access.
- **Staffora** — staff app (Android): own records, self attendance by code.

## Status

Phase 1 (foundation) done; Phase 2 (core logic) next. See [docs/PROGRESS.md](docs/PROGRESS.md).
Website: https://fincrew-web.vercel.app

## Docs

- [Plan](docs/PLAN.md) — the full brief
- [Progress](docs/PROGRESS.md) — what's done and what's next
- [Setup](docs/SETUP.md) — Supabase, GitHub, Vercel
- [Design](docs/DESIGN.md) — design system in Claude Design
- [Decisions](docs/DECISIONS.md) · [Changelog](docs/CHANGELOG.md) · [Features](docs/features/)

## Stack

Turborepo + pnpm · Next.js (Vercel) · Expo · Supabase (Postgres, RLS, auth, storage) ·
TanStack Query · Zod · i18next · Vitest

## Develop

```bash
pnpm install
pnpm test
pnpm --filter @fincrew/web dev
```

## Licence

MIT
