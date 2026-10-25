# FinCrew + Staffora

Staff, salary and expense management for one shop. Read these before doing anything:

1. `docs/PROGRESS.md` — where the build is, what's next, open items. **Start here.**
2. `docs/PLAN.md` — the full brief (rules in §4, data model §5, build order §8, working rules §9).
3. `docs/DECISIONS.md` — choices made during the build that the plan doesn't spell out.
4. `docs/features/` — one file per shipped feature: what it does and where the code lives.
5. `docs/DESIGN.md` — the design system in Claude Design (link, how to read it). All UI follows it.
6. `docs/NEW-MACHINE.md` — working from another computer (setup, env files, switching back).

## House rules

- **Commits:** plain messages, **no `Co-Authored-By` trailer**.
- **Push:** never push unless the user asks in that moment. The user pushes.
- **Docs are part of every change.** Any feature, fix, schema change or decision updates
  `docs/PROGRESS.md` (and `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/features/*` as relevant)
  in the same commit. A new session must be able to continue from the docs alone.
- Money is integer paise everywhere. Business dates are Asia/Kolkata `YYYY-MM-DD`.
- `packages/core` is pure TypeScript (no Supabase/React). Tests first.
- `packages/data` is the shared data layer (Supabase rows → core → screen data) for the website
  and the Android app; app-only UI helpers stay in each app.
- Schema changes only via new files in `supabase/migrations/`. Pushing to `main` applies them to
  the live database (CI `migrate` job), so **never edit, rename or delete a migration that is on
  `main`**; CI blocks it. New files need a later timestamp than the newest one.
- Every table: `shop_id`, RLS on, and tests in `supabase/tests/` as owner / custom role / staff.
  Multi-shop: policies check the ROW's shop, `private.has_permission(shop_id, 'key')`; add a
  cross-shop isolation test for each new table.
- SQL helpers and trigger functions go in the `private` schema (not exposed by the API); only
  functions the apps call go in `public`. New functions have no anon/PUBLIC execute by default:
  grant explicitly in the migration. Check with `supabase db advisors` after deploying.
- All UI strings go through `packages/i18n`.
- Website UI: shadcn/ui (`apps/fincrew-web/src/components/ui`) on the FinCrew tokens, plus
  `src/components/app` (FormDialog for tasks, PendingLink / TabLinks / skeletons for loading).
  Tasks open in dialogs; every click shows loading (`docs/features/fincrew-web.md` → Look and feel).
- Dates shown or typed are always **DD/MM/YYYY** (`formatDisplayDate` / `parseDisplayDate` from
  core); typed money goes through `parseRupees`. Never Intl/locale date formatting in apps.

## Owner rules

The owner's standing instructions (also kept in Claude's memory on the first PC; written here so
any computer has them):

- **No hard-coded rules.** Every business rule and value is an admin setting with a default
  (shop-wide, per leave template or per staff), with a test per option and a row in
  `docs/features/core-rules.md`; the apps' settings screens expose it. Support staff with no
  leave. Only facts (paise, IST, append-only ledger) stay fixed.
- **Design first.** New screens get an artboard in Claude Design (`docs/DESIGN.md`) before they
  are built; name the artboard in the feature doc. Small forms following existing patterns can
  skip it.
- **Dates** override the design system's "Fri, 23 Oct" voice: always DD/MM/YYYY; month headings
  ("October 2026") are fine.
- **The live Supabase project is the real shop.** Test on "Test Staff" with reversible data and
  revert. Append-only rows (ledger lines, advances, requests, check-in scans, audit, undoing
  payments) need the owner's OK each time; never disable their guards to clean up.
- **Sign-ins are the owner's.** Never type the owner's password or PIN, never create a real
  sign-in (setting a Staffora staff member's first PIN counts): open the screen and wait. Never ask for or paste
  the database password, access tokens or secret keys; the publishable key is fine. The
  service-role key never goes in app code, Vercel or GitHub.
- Don't touch the Supabase project `cheque-tracker-dev`.

## Commands

```bash
pnpm install
pnpm test        # core logic + RLS tests (PGlite, no Docker)
pnpm typecheck
pnpm build
pnpm --filter @fincrew/web dev
pnpm db:types    # regenerate packages/db types from the live project
```
