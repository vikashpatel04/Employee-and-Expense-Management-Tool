# Attendance codes, requests, phone + PIN sign-in

Phase 7 data (started 2026-10-24): what Staffora (the staff app) and the owner's code screen
and requests list need. Migrations `20261024000003_attendance_codes.sql`,
`20261024000004_requests.sql`, `20261024000005_staff_login.sql`; edge function
`supabase/functions/staff-auth`. Tests: `supabase/tests/attendance-codes.test.ts`,
`requests.test.ts`, `staff-login.test.ts`, `staff-auth.test.ts`; core
`packages/core/src/staff-login.test.ts`.

Status: **live** (pushed 2026-10-24, CI run 40098230155 applied the 3 migrations and deployed
`staff-auth`; types regenerated). FinCrew screens (website + Android) checked on live. Staffora
(the staff app) is next; check-in and PIN sign-in get their real end-to-end test with it.

## Attendance code (PLAN §4.5)

- `attendance_codes`: the shop's codes, newest = current. **No API access at all** (no policies,
  no grants). `attendance_code(shop)` (needs `attendance.code`) returns
  `{ code, validFrom, nextChange }` and makes a new code when there is none yet or the daily
  change time has passed; `regenerate_attendance_code(shop)` makes a new one now (always
  different from the last).
- Rotation and limits come from `shops.settings.attendanceCode` (core `CodeSettings`, edited in
  Settings → Pay & attendance rules → Attendance code): daily at a time (IST) or manual; minimum
  gap between in and out (30 min), repeat-tap cooldown (2 min), wrong codes (5 in 10 min → wait
  10 min). `private.code_settings` fills the core defaults (a test checks they match).
- `check_in(shop, code, method 'scan'|'typed', deviceId)` for the signed-in staff member →
  `{ ok, kind: 'in'|'out' }` or `{ ok: false, reason, retryAt? }`. Reasons: `not_staff`,
  `self_off` (staff.self_attendance off), `wrong_device`, `locked`, `wrong_code`, `cooldown`,
  `too_soon`, `already_checked_out`. Check-in writes the day as present (keeps a half day; turns
  another mark into present), `check_in` time, source `self`; check-out sets `check_out`. The
  first accepted check binds the phone if none is bound.
- `attendance_scans`: every attempt (time, device, method, in/out, result), append-only; seen by
  the person, `attendance.code` and `attendance.mark`.
- The rules in `private.check_in_at` mirror core `evaluateCheck`; a test runs a day of attempts
  through both and compares every result.
- Self check-ins are written inside the database while the staff member is signed in, so the
  attendance stamp trigger now looks at a transaction flag (`fincrew.self_check`) to keep them
  as source `self` with no marker.

## Requests

- `requests`: `kind` leave (`from_date`–`to_date`, up to 62 days) or advance (`amount_paise`),
  note, `status` pending → approved / rejected / cancelled, `decided_by` / `decided_at` /
  `decision_note`, and for approvals `leave_status` (paid / unpaid leave) or `advance_id`.
- Staff ask for themselves only (and only while active); new requests always start pending.
  They can cancel their own pending one. `requests.decide` approves or rejects. Since
  20261030000001: leave on days already in a waiting / approved leave request or marked as
  leave is refused on insert, and an approved request can be rejected later (an approved
  advance only once its advance is undone; `rejectApprovedRequest`, "Reject now" on the
  website's and app's Decided cards). A decided
  request is final; the request fields never change; nothing is deleted. An `advance_id` must
  be a "given" advance for the same person.
- Approving does the work in the apps' shared code (next step): mark the leave days, or give the
  advance (limit check), then record the approval.

## Phone + PIN sign-in (owner's decision 2026-10-25; replaced invite links)

Migration `20261025000002_phone_login.sql` (invite links, `invites` and their functions removed).

- **The phone number is the Staffora user id.** The owner adds staff with their mobile number in
  FinCrew; nothing is sent. `private.phone_key(text)` reads a number the same way however it was
  typed (spaces, dashes, leading 0, +91 / 91 / 0091 → 10 digits, else null), exactly like core
  `phoneKey` (parity test). Index `people_phone_key_idx`.
- Server side (service role only, called by `staff-auth`): `phone_lookup(phone)` → `{ ok,
personId, shopId, firstName, shopName, hasPin, authUserId }` for the one active staff member
  (not the owner) with that number, else `not_found` / `left` / `many` (two active staff share
  it). `pin_setup(phone, pin, device, authUser)` sets the first PIN (or a new one after a reset):
  `bad_pin`, `has_pin` (sign in instead), `wrong_device` (another phone than the bound one);
  links the sign-in, saves the bcrypt PIN, binds the phone. `pin_login(person, pin, device)` →
  `{ ok, authUserId, shopId }` or `no_login`, `left`, `wrong_device`, `no_pin` (the shop reset
  it: choose a new one), `locked`, `wait` (+ `retryAt`), `wrong_pin` (+ `triesLeft`).
- `pin_credentials`: bcrypt PIN hash (pgcrypto), wrong-PIN count, wait, lock. No API access.
- Owner side (`staff.edit`): `staff_logins(shop)` (per person: PIN set, locked, waiting until,
  phone bound), `reset_pin(person)` (forgot the PIN: removes it; the person chooses a new one on
  their bound phone), `unlock_login(person)`, `reset_staff_phone(person)`.
- PIN rules (core `evaluatePinAttempt`, settings `staffLogin`): wrong PINs count; every 5th
  starts a 15-minute wait; the 10th locks until someone with `staff.edit` unlocks; a right PIN
  clears the count; wrong phone or left staff are refused before the PIN is checked.
  `staffLogin.allowBiometrics` (default on): staff may open Staffora with their fingerprint.
  Settings → Pay & attendance rules → Staff sign-in. A test compares SQL and core attempt by
  attempt.
- **Change PIN** (migration `20261025000001_change_pin.sql`): `change_pin(person, current, new,
device)`, called by the signed-in staff member (authenticated, own person only, `is_self`).
  The new PIN must be 4 digits (`bad_pin`, not counted); the current one is checked by
  `pin_login_at`, so wrong ones count towards the same wait / lock and another phone or a
  person who left is refused; then `same_pin` if unchanged, else the new bcrypt hash →
  `{ ok: true }`. No edge function needed: the staff member already has a session.

### Edge function `staff-auth`

`supabase/functions/staff-auth/handler.ts` (plain TypeScript, tested with the real SQL
functions in PGlite and a fake Auth) and `index.ts` (Deno, service role from the function's
environment). POST JSON:

- `{ action: 'lookup', phone }` → `{ ok, personId, firstName, shopName, hasPin }`
- `{ action: 'setup', phone, pin, deviceId }` → `{ ok, personId, shopId, session }` (makes the
  person's sign-in the first time)
- `{ action: 'login', personId, pin, deviceId }` → `{ ok, personId, shopId, session }`

Each person's sign-in is a normal Supabase user with a server-only email
(`staff-<person id>@fincrew.invalid`) and no kept password: before each sign-in the function
sets a new random password and signs in with it, returning `access_token` / `refresh_token`.
JWT verification is off for this function (`supabase/config.toml`): callers aren't signed in
yet. CI deploys it after the migrations (`supabase functions deploy staff-auth --use-api`).

Later the same day: migration `20261024000006_staff_read_runs.sql` — staff may read a salary run
they have a finalized payslip in (their payslips' month was missing otherwise).

## Shared code (`packages/data/src/self-service.ts`)

`loadAttendanceCode`, `regenerateAttendanceCode`, `loadCheckIns` (today's accepted check-ins by
person with method and minutes late from the grid's rules, refused attempts, people working
today), `loadRequests` (pending oldest first / decided newest first, with names and who
decided), `loadRequestContext` (paid leave left for the asked days via `paidLeaveShortfall`;
advance owed / limit / cut), `countPendingRequests`, `decideRequest` (approve leave →
`writeAttendance` with `allowFuture`; approve advance → `recordAdvance`, which now returns the
advance id; then the request records it; refusals come back as reason codes), `askRequest` /
`cancelRequest` (for Staffora), `loadStaffLogins`, `resetPin`, `unlockLogin`, `resetStaffPhone`, `setSelfAttendance`, `minutesUntil`, `dateOfInstant`.

## Screens

Designs (FinCrew canvas, 2026-10-24): "Requests" (Android), "Web · attendance code",
"Web · requests", "Web · staff sign-in card"; the Android "Attendance code" / "· QR" artboards
existed already.

- **Website**
  - `/code` (`attendance.code`; sidebar "Attendance code"): today's code in large digits, when it
    changes, Copy code, New code (asks first), the QR (`src/lib/qr.tsx`, `qrcode` library, content
    = the 6 digits), Full screen (`/qr`, no sidebar, for a counter display) and Print; today's
    check-ins (in, out, scanned / typed, minutes late) and refused attempts.
  - `/requests` (`requests.decide`; sidebar with the waiting count): Waiting / Decided. Each card:
    person, when asked, Leave / Advance, dates or amount, note, context (paid leave left, or owed /
    limit / cut). Leave: mark as paid or unpaid leave (starts on unpaid when the balance is short);
    advance: paid with. Reply, Reject / Approve; past the limit "Approve anyway". Decided cards
    say who decided, when, how. The dashboard shows "N requests waiting → Review".
  - Staff detail → Overview, **Staffora sign-in** card (`staff.edit`, design "Web · staff sign-in
    card", reworked 2026-10-25): No phone number → add one in the details (it is the Staffora user
    id); Not set up yet → shows the number to type in Staffora; Signed in (or locked / waiting) →
    Unlock, New phone, Reset PIN (asks first). "Can check in with the attendance code" switch
    (`staff.self_attendance`). The public `/join/<token>` page is gone.
- **Android app**
  - Today: "Attendance code" button (with `attendance.code`) and the "N requests waiting →
    Review" banner (with `requests.decide`, refreshed when Today comes back into view).
  - `src/app/code.tsx`: code, when it changes, Show QR (full screen, `src/components/qr.tsx`), New
    code with a confirmation, today's check-ins and refused attempts.
  - `src/app/requests.tsx`: Waiting / Decided, cards like the website; Approve / Reject open a
    sheet (leave: paid / unpaid; advance: paid with; reply; "Approve anyway" past the limit).

## Checked

2026-10-24 on live, signed in as the owner:

- **Code**: website `/code` showed a code changing at 12:00 AM (daily default), New code (asks
  first) gave a different code and the QR followed; `/qr` full screen; 0 of 1 checked in. App:
  Attendance code button on Today, code screen, full-screen QR. (The QR is made by the `qrcode`
  library from the digits; it wasn't machine-decoded here.)
- **Sign-in card** (Test Staff): Not invited → Invite made a link (valid 48 h, WhatsApp message
  ready) → `/join/<token>` greeted "Hi Test Staff" through the deployed edge function; a wrong
  link says it doesn't work; Cancel invite → Not invited; the code check-in switch saves both
  ways. Not done on live: accepting an invite / PIN sign-in (that creates a real sign-in; it's
  covered by the tests and gets its live check with Staffora).
- **Requests**: two inserted for Test Staff (leave 02–03/11, advance ₹1,500) showed on the
  website and the app with context (no paid leave left → form starts on Unpaid; owes ₹0 · limit
  ₹5,000 · cut ₹1,000); the app's Today banner counted them. Rejected one in the app, rejected the
  advance on the website with a reply, approved a third (leave 04–05/11) as unpaid → those days
  were written as unpaid leave; Decided tabs show who / when / how. No advance or ledger line was
  made. Fixed after the check: the app's Decided tab kept the old "Rejected." note and showed the
  advance context line; the app QR passed `accessible` to the web DOM.
- Cleanup: the two leave days and the invite were removed; the three decided test requests stay
  (requests can't be deleted; they're marked "TEST:"). Self attendance back off.
- Advisors after the push: only the expected "signed-in users can execute" warnings for the new
  owner-side functions (each checks its permission inside); the service-role-only functions
  aren't callable by users.
