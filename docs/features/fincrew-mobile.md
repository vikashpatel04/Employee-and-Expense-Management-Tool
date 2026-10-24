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
- **Staff** (`(tabs)/staff.tsx`): search by name or phone, Active / Left / All, rows with
  phone or joining/leaving date and today's status; tap → staff detail.
- **Staff detail** (`staff/[id].tsx`, design "Staff detail"): back, avatar, name, joined,
  today's status / minutes late / check-in; tabs by permission (Ledger: self or `salary.view`;
  Pay: self or `staff.pay.view`), components in `src/components/staff/`:
  - **Overview**: balance (due / owes / settled), advance to recover with cut and limit, Call and
    WhatsApp, this month's present / late / paid leave / half day and payable days.
  - **Attendance**: Monday-first month calendar (status colour + icon, late dot, today bold),
    chosen day's status, minutes late, in/out times, **Change** with the shared status sheet
    (`writeAttendance`), month counts.
  - **Ledger**: balance, lines by month newest first with running balance, "Undone" marks.
  - **Pay**: current pay, overtime, shift and grace, leave template, own rules, allowances,
    deductions, history (read-only; changes on the website for now).
- Shared loaders in `packages/data/src/staff.ts`: `loadStaffList`, `loadStaffOverview`,
  `loadLedger`, `loadPay`. Shared components: `status-sheet.tsx` (StatusPicker sheet used by
  Today and staff Attendance), `Segmented`, `IconButton` in `ui.tsx`.
- **More**: who is signed in, the website link, sign out. **Money** says "Coming next" and points
  to the website.

## Checked

2026-10-24, signed in by the owner, live shop at 375 × 812:

- **Today**: real data (Sat 24/10/2026, Test Staff not marked); status sheet → Present; paid
  leave refused with the shared rule ("Test Staff has 0 paid leave left this month."); Not
  marked clears; Mark all present (confirmation now shown for one person too) and clear;
  23/10 shows the half day; 22/10 "Nobody works here on this day".
- **Staff**: list, search incl. "Nobody matches", Active/Left filter; detail Overview (settled
  ₹0.00, advance ₹0.00, cut ₹1,000 / limit ₹5,000, October: 1 half day, 0.5 payable days; no
  phone so no Call/WhatsApp), Attendance calendar and Change on today (header followed), Ledger
  (empty: Test Staff has no lines — lines with data not seen yet), Pay (₹22,000 monthly, ₹100
  overtime, 9:30 AM – 8:30 PM, 10 min grace, no template, shop's rules).
- Database back to the one 23/10 half day afterwards.

2026-10-24 (slice B): typecheck, tests and build pass; signed-out visits to `/staff` go to Sign
in. Staff screens not yet seen with data (owner sign-in needed).

2026-10-24, in the browser at 375 × 812: the app starts, signed-out users land on Sign in, the
screen matches the design and fits the width. Today could not be checked yet: it needs the
owner to sign in (never typed for them).

## Next

Give advance / pay from staff detail (with Money), Money (expenses, salary, advances), attendance code screen and
requests (with Phase 7 data), push notifications, widgets (Phase 8), EAS builds.
