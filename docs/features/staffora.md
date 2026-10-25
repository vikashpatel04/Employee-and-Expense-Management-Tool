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
Scheme `staffora`; Android package id
`app.staffora.mobile` (placeholder). App icon: design system "B · Staff badge" (`pnpm ui:icons`,
`docs/DESIGN.md`).

## How signing in works

Changed 2026-10-25 from invite links to **phone number + PIN** (owner's decision; DECISIONS.md).

- **User id = phone number** the shop saved for the person in FinCrew. **Password = a 4-digit
  PIN** they choose the first time on their phone. Forgot it → the shop taps Reset PIN in
  FinCrew and they choose a new one.
- **Device id**: made once with `expo-crypto` and kept on the phone (AsyncStorage
  `staffora_device`); the first PIN ties the sign-in to it.
- **Profile**: after signing in, the phone keeps who it belongs to (person, shop, names, the phone
  number; no secrets) in AsyncStorage `staffora_profile`.
- **States** (root `_layout.tsx`, `Stack.Protected`): no profile → Welcome (phone number); profile
  but not opened this time → PIN (or fingerprint); opened → tabs and the other screens.
- `src/lib/auth.tsx`: `staffAuth` calls the `staff-auth` edge function; `lookup` (who the number
  is), `setUp` (first PIN / new PIN after a reset), `signIn` (a number that already has a PIN, on a
  phone without a profile), `unlock` (PIN), `unlockWithBiometric`, `setBiometric`, `changePin`,
  `lock`, `forget`. Sessions are set with `supabase.auth.setSession`, so RLS shows only the
  person's own rows.
- **Fingerprint / face** (`expo-local-authentication`): when the shop allows it
  (`staffLogin.allowBiometrics`) and the phone has one set up, Me shows "Open with fingerprint".
  With it on, Lock keeps the session on the phone, and the PIN screen asks for the fingerprint
  first; then Staffora checks the person is still active on this phone and the shop still allows
  it (else back to the PIN). Not available in the browser preview.

## Built

- **Welcome** (`welcome.tsx`, design "Sign in with phone · first run", 2026-10-25): mobile number
  (+91 field, checked with core `phoneKey`) → `lookup`. No PIN yet: "Hi <first name>, you're on
  the staff list at <shop>" → "That is me, set my PIN" → PIN twice (a mismatch starts again) →
  `setUp` → Home. Already has a PIN (Staffora removed or reinstalled): enter it → `signIn`.
  Messages for a number that isn't on the list, has left, or is on two staff records.
- **PIN** (`pin.tsx`, design "PIN to open"): avatar, name, shop, 4-digit pad; messages for a
  wrong PIN (tries left), a wait (until when), locked, another phone, left the shop, no sign-in.
  **Use fingerprint** (and an automatic prompt) when it's on. After the shop resets the PIN
  (`no_pin`) the same screen asks for a new one twice (`setUp` with the saved phone number).
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
- **Me**: name and shop, **Change PIN**, Lock Staffora, Remove from this phone; a "PIN
  changed" note after changing it (`?changed=1`).
- **Change PIN** (`change-pin.tsx`, 2026-10-25): the same pad and steps as choosing the PIN in
  "Join · first run" (no new artboard): current PIN, new PIN, new PIN again (mismatch caught on
  the phone), then `change_pin` through `useAuth().changePin`. Refusals use the PIN screen's
  messages (`src/lib/pin-text.ts`, shared with `pin.tsx`); `same_pin` / `bad_pin` go back to
  the new-PIN step.
- **Attendance** (`(tabs)/attendance.tsx`, design "Attendance"): month switcher, Monday-first
  calendar (status colour + icon, late dot), the chosen day's status / times / minutes late, the
  month's counts and payable days, **Ask for leave**. Read-only; `loadAttendanceMonth`.
- **Money** (`(tabs)/money.tsx`, design "Money · ledger / payslips"): due to me / I owe / settled,
  advance to repay and the next cut; Ledger (by month, newest first, running balance, undone
  marks; `loadLedger`) or Payslips (finalized months, net, paid or still due; new shared
  `loadMyPayslips`); **Ask for an advance**. Tap a payslip → `payslip/[id].tsx` (lines, net, paid
  so far, still to pay; new shared `loadPayslipView`).
- **Home payslip card** (2026-10-25, design "Home"): the newest finalized payslip — "<month>
  payslip", ready date (when finalized, DD/MM/YYYY), net pay, paid / due, **Open payslip**.
  `loadMyDay` loads it with the shared `loadMyPayslips` (now with `finalizedAt`).
- **Share payslip** (2026-10-25): button on the payslip page; the phone's share sheet
  (WhatsApp, SMS, …) with plain text from the shared `payslipShareText` (`packages/data/src/
payslip-text.ts`: shop, name, month, period, payable days, each line, net, paid, still to
  pay). FinCrew can use the same text for its WhatsApp share.
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
builds and starts.

2026-10-24, later: **the owner joined as Test Staff** in the preview (set the PIN themselves).
Checked with live data: Home ("Good evening, Test", today Present, October 1.5 days present /
1.5 payable, the "shop marks your attendance" note since self attendance is off); a page reload
asks for the PIN again (as designed) and the owner re-entered it; Attendance calendar with 23/10
Half day; Money settled ₹0.00 with salary +₹1,065.00 (31/10) and paid −₹1,065.00 by UPI (24/10);
Ask for leave shows the three earlier test requests (Approved / Not approved, replies), From
can't go before today, To moves the day count. Found and fixed:

- Home said "check in when you reach the shop" on a day the shop had already marked; now "The
  shop marked you as … today".
- **Payslips said "No payslips yet"**: staff can read their finalized payslips but not the salary
  run (its month), so the join dropped them (the website payslip page had the same gap for
  staff). Migration `20261024000006_staff_read_runs.sql` lets a person read a run they have a
  finalized payslip in (test in `money.test.ts`). Pushed (CI run 40104302836); after it Payslips
  showed October 2026 ₹1,065.00 Paid, and the payslip page 23/10–31/10/2026, 1.5 of 9 payable
  days, net ₹1,065.00, paid ₹1,065.00, still to pay ₹0.00 — same as the website.

Not tried yet: sending a request or checking in (both leave permanent rows), Lock / Remove.

## Next

Biometric unlock (optional), push notifications. Live checks still to do with the owner:
change PIN, the Home payslip card and Share on the owner's Test Staff sign-in (the preview lost
it on 2026-10-25: re-join needs New phone + a new invite, the owner types the PIN), sending a
request and checking in (permanent rows — ask first).
