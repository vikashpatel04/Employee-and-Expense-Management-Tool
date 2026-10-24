# Attendance codes, requests, invites and PIN sign-in

Phase 7 data (started 2026-10-24): what Staffora (the staff app) and the owner's code screen
and requests list need. Migrations `20261024000003_attendance_codes.sql`,
`20261024000004_requests.sql`, `20261024000005_staff_login.sql`; edge function
`supabase/functions/staff-auth`. Tests: `supabase/tests/attendance-codes.test.ts`,
`requests.test.ts`, `staff-login.test.ts`, `staff-auth.test.ts`; core
`packages/core/src/staff-login.test.ts`.

Status: **database, edge function, settings and FinCrew screens (website + Android) done, not
yet live** (they apply and deploy on the next push; then `pnpm db:types`). Staffora (the staff
app) is next.

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
  They can cancel their own pending one. `requests.decide` approves or rejects. A decided
  request is final; the request fields never change; nothing is deleted. An `advance_id` must
  be a "given" advance for the same person.
- Approving does the work in the apps' shared code (next step): mark the leave days, or give the
  advance (limit check), then record the approval.

## Invites and PIN sign-in (PLAN §1, §10)

- `create_invite(person)` (`staff.edit`; not the owner, not people who left) →
  `{ token, expiresAt }`. 48 random hex characters; only the SHA-256 is stored; valid for
  `staffLogin.inviteHours` (48); a new invite cancels the person's unused ones.
  `revoke_invite(person)` cancels them. `invites` rows are readable by `staff.edit` without the
  hash.
- `pin_credentials`: bcrypt PIN hash (pgcrypto), wrong-PIN count, wait, lock. No API access.
- Owner side (`staff.edit`): `staff_logins(shop)` (per person: PIN set, locked, waiting until,
  open invite expiry, phone bound), `unlock_login(person)`, `reset_staff_phone(person)`.
- Server side (service role only, called by `staff-auth`): `invite_lookup(token)`,
  `invite_accept(token, pin, device, authUser)` (links the sign-in, saves the PIN, binds the
  phone, uses the invite; a later invite resets the PIN on the same sign-in),
  `pin_login(person, pin, device)` → `{ ok, authUserId, shopId }` or `wrong_device`, `left`,
  `no_login`, `locked`, `wait` (+ `retryAt`), `wrong_pin` (+ `triesLeft`).
- PIN rules (core `evaluatePinAttempt`, settings `staffLogin`): wrong PINs count; every 5th
  starts a 15-minute wait; the 10th locks until someone with `staff.edit` unlocks; a right PIN
  clears the count; wrong phone or left staff are refused before the PIN is checked. Settings →
  Pay & attendance rules → Staff sign-in. A test compares SQL and core attempt by attempt.

### Edge function `staff-auth`

`supabase/functions/staff-auth/handler.ts` (plain TypeScript, tested with the real SQL
functions in PGlite and a fake Auth) and `index.ts` (Deno, service role from the function's
environment). POST JSON:

- `{ action: 'invite', token }` → `{ ok, name, shopName }`
- `{ action: 'accept', token, pin, deviceId }` → `{ ok, personId, shopId, session }`
- `{ action: 'login', personId, pin, deviceId }` → `{ ok, personId, shopId, session }`

Each person's sign-in is a normal Supabase user with a server-only email
(`staff-<person id>@fincrew.invalid`) and no kept password: before each sign-in the function
sets a new random password and signs in with it, returning `access_token` / `refresh_token`.
JWT verification is off for this function (`supabase/config.toml`): callers aren't signed in
yet. CI deploys it after the migrations (`supabase functions deploy staff-auth --use-api`).

## Shared code (`packages/data/src/self-service.ts`)

`loadAttendanceCode`, `regenerateAttendanceCode`, `loadCheckIns` (today's accepted check-ins by
person with method and minutes late from the grid's rules, refused attempts, people working
today), `loadRequests` (pending oldest first / decided newest first, with names and who
decided), `loadRequestContext` (paid leave left for the asked days via `paidLeaveShortfall`;
advance owed / limit / cut), `countPendingRequests`, `decideRequest` (approve leave →
`writeAttendance` with `allowFuture`; approve advance → `recordAdvance`, which now returns the
advance id; then the request records it; refusals come back as reason codes), `askRequest` /
`cancelRequest` (for Staffora), `loadStaffLogins`, `createInvite`, `inviteUrl`, `revokeInvite`,
`unlockLogin`, `resetStaffPhone`, `setSelfAttendance`, `minutesUntil`, `dateOfInstant`.

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
  - Staff detail → Overview, **Staffora sign-in** card (`staff.edit`): Not invited → "Invite to
    Staffora" makes a link shown once (Copy, WhatsApp with a ready message); Invited (until when)
    → New link / Cancel invite; Signed in (or locked / waiting) → Unlock, New phone, Reset PIN
    (new link). "Can check in with the attendance code" switch (`staff.self_attendance`).
  - `/join/<token>` (public): asks the edge function who the invite is for and shows "Join
    <shop> on Staffora", **Open in Staffora** (`staffora://join/<token>`) and what happens next;
    clear messages for used / expired / wrong links. Opening it uses nothing up.
- **Android app**
  - Today: "Attendance code" button (with `attendance.code`) and the "N requests waiting →
    Review" banner (with `requests.decide`, refreshed when Today comes back into view).
  - `src/app/code.tsx`: code, when it changes, Show QR (full screen, `src/components/qr.tsx`), New
    code with a confirmation, today's check-ins and refused attempts.
  - `src/app/requests.tsx`: Waiting / Decided, cards like the website; Approve / Reject open a
    sheet (leave: paid / unpaid; advance: paid with; reply; "Approve anyway" past the limit).

## Checked

2026-10-24, before the push (the live database doesn't have these tables yet): typecheck, tests
(core 234, db 160) and the website build pass; the website dashboard still loads with the new
sidebar links; `/join/<token>` shows the "couldn't check" message while the function isn't
deployed. **To check after the push**: `/code` and the QR, invite → join page → (Staffora) and the
sign-in card states, requests (needs a request from Staffora, or one inserted for Test Staff),
the Android code and requests screens.
