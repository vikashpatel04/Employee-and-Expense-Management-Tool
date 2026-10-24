# Attendance codes, requests, invites and PIN sign-in

Phase 7 data (started 2026-10-24): what Staffora (the staff app) and the owner's code screen
and requests list need. Migrations `20261024000003_attendance_codes.sql`,
`20261024000004_requests.sql`, `20261024000005_staff_login.sql`; edge function
`supabase/functions/staff-auth`. Tests: `supabase/tests/attendance-codes.test.ts`,
`requests.test.ts`, `staff-login.test.ts`, `staff-auth.test.ts`; core
`packages/core/src/staff-login.test.ts`.

Status: **database, edge function and settings done, not yet live** (they apply and deploy on
the next push; then `pnpm db:types`). Screens: see "Screens" below.

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

## Screens

Not built yet: website code page and requests, invite button on the staff page, FinCrew app code
screen and requests banner, then Staffora.
