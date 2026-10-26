# Helper sign-ins (email + password)

Built 2026-10-26 (owner's choice: email + password). A **helper** is someone who helps run the
shop with a role (manager, accountant…) but isn't on the payroll: a `people` row with no `staff`
row and not the owner. Staff sign in to Staffora with their phone number instead
(`staff-self-service.md`); the owner has their own sign-in.

## How it works

- **Give a sign-in** (Settings → Roles → Helpers, needs `staff.edit`): the helper's email and a
  **first password** ("Make one" suggests an easy-to-read one like `kmtr-4827`). The person
  giving it tells the helper. No email is sent: Supabase's built-in mailer only delivers to the
  project team, so invite emails wouldn't arrive without a custom SMTP sender.
- **First sign-in**: the sign-in carries `user_metadata.must_change_password`. The website
  (`lib/session.ts` → `/password`) and the FinCrew app (`_layout.tsx` guard → `password.tsx`)
  show only "Choose your password" until the helper sets their own (`auth.updateUser`, which
  clears the flag; the session is refreshed).
- **Forgot the password**: **Reset password** sets a new first password (they choose their own
  again). Refused when the same sign-in is used in another shop (`other_shops`): then the
  password is the person's own business.
- **An email that already signs in** (e.g. an accountant who helps two of the owner's shops):
  "Give a sign-in" links that sign-in to this shop too; their password doesn't change.
- **Remove sign-in** unlinks it (the helper and their roles stay); the sign-in is deleted unless
  another shop uses it. **Remove** (the helper) removes the sign-in first.
- Password rules (length…) are Supabase Auth's settings; its message is shown as it comes.

## Code

- Migration `20261026000001_helper_logins.sql`: `people.login_email` (shown on the Roles page;
  apps can't read `auth.users`); trigger `private.guard_login_link` — signed-in users can no
  longer change `people.auth_user_id` / `login_email` through the API (only the server can);
  `public.helper_login_target(person)` (as the caller: member, `staff.edit`, not owner, not
  staff; returns the link and how many other shops use it); service-role only:
  `auth_user_by_email`, `helper_login_link`.
- Edge function `supabase/functions/helper-auth` (`handler.ts` plain TS, tested in
  `supabase/tests/helper-auth.test.ts`; `index.ts` Deno): actions `give`, `reset`, `remove`; the
  permission check runs with the caller's token, the account changes with the service role.
  Deployed by CI (`verify_jwt = false`, it checks the token itself).
- `packages/data/src/helper-login.ts`: `helperLogin` (calls the function), `firstPassword`.
- Website: `settings/roles/actions.ts` (`giveHelperLogin`, `resetHelperPassword`,
  `removeHelperLogin`), `role-forms.tsx` (forms in dialogs), `settings/roles/page.tsx` (helper
  rows: "Signs in as …" / "No sign-in"), `app/password/*`.
- App: `apps/fincrew-mobile/src/app/password.tsx`.

## Checked

Tests (11): only helpers, staff.edit in that shop, email check and Supabase's password message,
new sign-in linked with the must-change flag, has_login, existing email linked without a new
password, reset (and refused for other shops), remove (deletes only when unused elsewhere), the
guard on `auth_user_id` / `login_email`, service functions closed to signed-in users. Migration
dry-run on live (rolled back). Not tried live: needs the push (edge function) and a real email.
