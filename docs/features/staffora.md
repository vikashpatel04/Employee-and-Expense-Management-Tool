# Staffora (staff app)

Phase 7 (started 2026-10-24). Expo SDK 58 + Expo Router, `apps/staffora-mobile`
(`@fincrew/staffora`), set up like the FinCrew app (`docs/features/fincrew-mobile.md`) with the
Staffora palette (`themes.staffora`, amber accent). Designs: the Staffora key screens canvas
(`docs/DESIGN.md`); "Join · first run" and "PIN to open" were added on 2026-10-24. Rules and data
come from `packages/core` / `packages/data` and the Phase 7 database
(`docs/features/staff-self-service.md`).

## Run it

```bash
pnpm --filter @fincrew/staffora web     # in a browser at phone size (http://localhost:8082 via the preview)
```

Needs `apps/staffora-mobile/.env.local` (same two public values as the FinCrew app; copy
`.env.example`). Preview config `.claude/launch.json` → "staffora-mobile-web" (port 8082).
Scheme `staffora` (invite links hand over with `staffora://join/<token>`); Android package id
`app.staffora.mobile` (placeholder); icons are still FinCrew's placeholders.

## How signing in works

- **Device id**: made once with `expo-crypto` and kept on the phone (AsyncStorage
  `staffora_device`); the server ties the sign-in to it.
- **Profile**: after joining, the phone keeps who it belongs to (person, shop, names; no secrets)
  in AsyncStorage `staffora_profile`.
- **States** (root `_layout.tsx`, `Stack.Protected`): no profile → Welcome; profile but not opened
  this time → PIN; opened → tabs and the check-in screens. `join/[token]` is always reachable (a
  new link resets the PIN).
- `src/lib/auth.tsx`: `staffAuth` calls the `staff-auth` edge function; `join` (accept: set PIN,
  tie phone, session), `unlock` (PIN login), `lock` (sign out locally; PIN needed again),
  `forget` (remove the profile; a new link is needed). Sessions are set with
  `supabase.auth.setSession`, so RLS shows only the person's own rows.

## Built

- **Welcome** (`welcome.tsx`): what Staffora is, "open the invite link on this phone", and a box to
  paste the link (pulls the 48-character token out of it).
- **Join** (`join/[token].tsx`, design "Join · first run"): asks `staff-auth` who the link is for
  ("Hi <first name>", shop, what Staffora does), then "That is me, set my PIN": PIN twice on the
  CodePad (a mismatch starts again, checked on the phone), then accept → Home. Clear messages for
  used / expired / wrong links.
- **PIN** (`pin.tsx`, design "PIN to open"): avatar, name, shop, 4-digit pad; messages for a
  wrong PIN (tries left), a wait (until when), locked, another phone, left the shop, no sign-in.
- **CodePad** (`components/code-pad.tsx`): digit boxes + big number pad, Clear / Delete, dots for
  PINs; used for the PIN and the 6-digit code.
- **Home** (`(tabs)/index.tsx`, design "Home"): greeting, today (status, in / out, minutes late,
  shift), this month (days present, late days, payable days), and the check-in card: Check in /
  Check out when you leave / done for today, with **Scan QR** and **Enter code**; when the shop
  has self attendance off for this person, a note instead. Data: `src/lib/my-day.ts`
  (`loadAttendanceMonth`, `loadPay`, the person's `self_attendance`, the shop's code settings).
- **Enter code** (`enter-code.tsx`), **Scan QR** (`scan.tsx`, `expo-camera` QR scanning, content
  read with core `parseScannedCode`), both calling `check_in` with this phone's id; refusals
  explained with the time to try again (`src/lib/check-text.ts`).
- **Checked in / out** (`checked-in.tsx`): the time large, present + minutes late, day, shop, how,
  and from when check-out works (the shop's minimum gap).
- **Me**: name and shop, Lock Staffora, Remove from this phone.
- **Attendance** (`(tabs)/attendance.tsx`, design "Attendance"): month switcher, Monday-first
  calendar (status colour + icon, late dot), the chosen day's status / times / minutes late, the
  month's counts and payable days, **Ask for leave**. Read-only; `loadAttendanceMonth`.
- **Money** (`(tabs)/money.tsx`, design "Money · ledger / payslips"): due to me / I owe / settled,
  advance to repay and the next cut; Ledger (by month, newest first, running balance, undone
  marks; `loadLedger`) or Payslips (finalized months, net, paid or still due; new shared
  `loadMyPayslips`); **Ask for an advance**. Tap a payslip → `payslip/[id].tsx` (lines, net, paid
  so far, still to pay; new shared `loadPayslipView`).
- **Ask** (`ask.tsx`, design "Ask for leave / advance, my requests"): leave = From / To day
  steppers (today to a year ahead, at most 62 days), or advance = amount with quick amounts and
  what I owe now; a note; **Send to the shop** (`askRequest`). Below: my requests with Waiting /
  Approved / Not approved / Cancelled, the shop's reply, and **Cancel** while waiting
  (`cancelRequest`). Shared form pieces copied from FinCrew (`components/form.tsx`; the day
  stepper gains `min` and a spoken label).

## Checked

2026-10-24, browser preview at 375 × 812, live project:

- Welcome renders; pasting an invite link made on the website opened Join, which greeted "Hi Test"
  through the live edge function; PIN typed twice differently → "The two PINs were different"
  and back to choosing (nothing sent).
- **Not checked yet** (needs a real staff sign-in, which the owner must create by typing a PIN):
  accepting the invite, the PIN screen, Home with data, Enter code / Scan QR check-in, Checked
  in, Lock / Remove. An open invite link for Test Staff was left for that (48 h). The camera
  needs a real phone or a browser with a camera.

Slice B (Attendance, Money, payslip, Ask) on 2026-10-24: typecheck passes and the app still
builds and starts; the screens sit behind the sign-in, so they are **not seen with data yet**
(same owner step as above).

## Next

Me → change PIN (needs a small SQL function + `staff-auth` action), latest payslip card on Home,
share a payslip, biometric unlock (optional), push notifications.
