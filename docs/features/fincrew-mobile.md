# FinCrew Android app

Phase 5 (started 2026-10-24). Expo SDK 58 + Expo Router, `apps/fincrew-mobile`
(`@fincrew/mobile`). Screens follow the Android artboards on the FinCrew key screens canvas
(`docs/DESIGN.md`); every rule and data load is shared with the website through
`packages/core` and `packages/data`, so both apps always agree.

## Run it

```bash
pnpm --filter @fincrew/mobile web      # in a browser at phone size (http://localhost:8081)
pnpm --filter @fincrew/mobile start    # Expo dev server for a phone / emulator
```

Needs `apps/fincrew-mobile/.env.local` with `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (copy `.env.example`; same public values as the website).
Preview config `.claude/launch.json` → "fincrew-mobile-web". Real Android builds go through
EAS (needs the owner's Expo account; not set up yet). Android package id `app.fincrew.mobile`
is a placeholder until the first store build.

## Built

- **Foundations** (`src/lib`): `theme.ts` (FinCrew palette light/dark from `@fincrew/ui`
  `themes`, design text styles in Anek Latin per weight), `supabase.ts` (publishable key only;
  session kept with AsyncStorage on the phone), `session.tsx` (sign-in state, shops and
  permissions via `@fincrew/data` `loadMemberships` / `loadMe`, chosen shop remembered),
  `i18n.ts` (same strings as the website).
- **Components** (`src/components`): `ui.tsx` (Text, Card, Button, Avatar, StatusPill,
  SummaryChip, SectionTitle), `sheet.tsx` (bottom sheet), `shop-header.tsx` (current shop +
  "Your shops" switch sheet), `coming-next.tsx`.
- **Sign in** (`src/app/sign-in.tsx`): email + password; signed-out users are kept here by the
  root layout's guard (`Stack.Protected`).
- **Tabs** (`src/app/(tabs)`): Today · Staff · Money · More (PLAN §6.1).
- **Today** (`(tabs)/index.tsx`, design "Today"): shop header, day switcher (no future days),
  chips present / absent / late / not marked (tap to filter), "Not marked" and "Marked" lists
  (avatar, name, check-in or weekly offs, status pill, minutes late), tap a person → status
  sheet (Present, Half day, Absent, Paid leave, Unpaid leave, Not marked), **Mark all present**.
  Data: `loadAttendanceMonth`; writes: `writeAttendance` (future days refused, past days need
  `attendance.edit_past`, paid leave within the balance) — the same functions the website uses.
- **More**: who is signed in, the website link, sign out. **Staff** and **Money** say "Coming
  next" and point to the website.

## Checked

2026-10-24, in the browser at 375 × 812: the app starts, signed-out users land on Sign in, the
screen matches the design and fits the width. Today could not be checked yet: it needs the
owner to sign in (never typed for them).

## Next

Staff (list, detail tabs), Money (expenses, salary, advances), attendance code screen and
requests (with Phase 7 data), push notifications, widgets (Phase 8), EAS builds.
