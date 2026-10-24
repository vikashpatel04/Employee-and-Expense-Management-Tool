# Decisions

Choices made during the build that PLAN.md doesn't spell out. Newest first.

## 2026-10-24 — Dashboard

- Designed in Claude Design first (owner's request), on the FinCrew key screens canvas next to
  the other web artboards, then built to match.
- Each part appears only with its permission: today's attendance needs `staff.view` (Mark today
  present also `attendance.mark`), Due to staff and the salary card `salary.view`, Advances
  `salary.view` or `advances.give`; holidays show to everyone, leaving dates need `staff.view`.
- "Present" on the dashboard counts half days too; lateness comes from the same core rules as
  the grid (`loadAttendanceMonth` now also returns each cell's check-in and minutes late).
- The design's "Attendance code" button is left out on the web until the code exists
  (Phase 7 edge function); the Android Today screen gets it in Phase 5.

## 2026-10-24 — Payslip print, CSV, clearing marks

- **Payslip PDF = the browser's "Save as PDF"** from a print-ready page (`/payslips/[id]`), not
  a server PDF library: no new dependency, same layout on screen and paper. `payslips.pdf_path`
  stays unused until Staffora needs stored files (Phase 7). While printing, the page switches to
  the light theme (`beforeprint`) so dark mode can't print light text on white paper.
- The payslip page is outside the app shell (no sidebar to hide) and relies on RLS: people see
  their own finalized payslips, `salary.view` sees all, anything else is "not found".
- **Attendance CSV** is wide (one row per person, one column per day) like the grid, UTF-8 with a
  BOM so Excel shows names and ₹ correctly, and needs `reports.export` (PLAN §3: reports export).
  Days after today are blank; status words are the app's own labels.
- **Clearing a mark deletes the attendance row**, so the day falls back to what the rules give
  (not marked, weekly off or holiday). Same permission and past/future checks as setting one.

## 2026-10-24 — Staff detail extras

- **Leaving date sets the status**: any leaving date (even a future one) marks the person `left`
  (the staff list's Left filter); clearing it makes them `active`. Attendance and salary already
  use the leaving date itself, so pay stops after that day either way.
- **Opening balance is set once**: the ledger allows one `opening_balance` line per person and is
  append-only, so the form needs a confirmation tick and disappears once set (the Overview shows
  the line instead). Correcting one later needs a ledger adjustment screen (not built).
- **Own rules live on pay settings** (`pay_rules_override` / `late_policy_override`), so they are
  dated like pay: saving from a date starts a copy of the pay in effect then (or updates the
  version starting that day) and applies to every later version too. Changing pay from a date
  copies the own rules of the version it follows, so they're never dropped silently. A choice
  left on "Shop's rule" is simply not stored and follows Settings.
- **Allowances and deductions**: "End today" sets the end date (past months keep them);
  "Remove" (two clicks) deletes one added by mistake. Finalized payslips keep their own lines.
- Changing someone's leave template from the Pay tab is the same dated assignment as Settings →
  Leave templates → Move staff (`staff.edit`); archived templates aren't offered.

## 2026-10-24 — Roles screen

- Permission and area names shown on screen come from i18n (`permissions.*`,
  `permissionAreas.*`), not the database `permissions.description`, so they translate later. A
  test in `packages/i18n` fails if a key in core `PERMISSIONS` has no label.
- The owner isn't offered roles (they hold every permission); the screen says so.
- Saving a role's permissions or people makes them exactly what's ticked (delete the unticked,
  add the new). Saving people only touches people the editor can see (RLS on `people` needs
  `staff.view`), so it never removes someone hidden from them; without `staff.view` the people
  list isn't shown.
- People without a login can be given a role; it takes effect when they sign in (Staffora invite,
  later). Non-staff helpers (a manager not on payroll) need a way to be added first: later.
- Deleting a role is two clicks ("Delete role", then "Yes, delete this role"); its permissions
  and people go with it (cascade).
- `settings.roles` can grant any permission, including to themselves: the label says so.

## 2026-10-24 — Settings screens

- **Who can change what**: holidays and leave templates need `settings.leave_templates` (as the
  RLS policies already say); moving staff onto a template needs `staff.edit` (assignments are part
  of a person's setup); shop rules need `settings.shop`, because they live in `shops.settings` and
  only that permission may update the shop row. `settings.attendance` has no screen of its own yet;
  splitting late/code rules out for it would need a database function (later, if a shop wants it).
- **Shop rules are saved whole**: the form writes the full `ShopRules` into `shops.settings`
  (other keys kept), so later changes to code defaults never change a shop's rules silently.
  Until the first save, the defaults from `resolveShopRules` apply.
- **A new leave template starts blank** (no weekly offs, 0 paid leave, lapse, full month,
  sandwich off): nothing is assumed. Templates can't be deleted (no delete policy; old payslips
  were worked out with them), only archived; an archived template can't take new staff.
- **No "no template" assignment**: assignments always name a template. To take someone off leave
  from a date, move them to a template with no weekly offs and 0 paid leave.
- **A holiday on a date that already has one replaces it** (upsert on shop + date).
- **Forms submit through `useFormAction`** (`src/lib/use-form-action.ts`), not `<form action>`:
  React 19 resets a form after its action, which wiped what was typed whenever a save was refused.
- **Client components may import `t`** from `@/lib/i18n` (i18next initialises synchronously with
  the bundled English strings); the settings forms do, instead of passing every label as a prop.
- Settings screens have no Claude Design artboards yet; they reuse the system's web patterns
  (cards, segmented controls, lists) from the existing screens.

## 2026-10-23 — Salary run screen

- The website works out payslips with `packages/core` on the server (`computeMonth`) and stores
  them as drafts; the database's `finalize_payslip` posts the ledger. Same inputs as the
  attendance grid, so the grid's Days and the payslip agree.
- Running again: drafts are updated in place; finalized payslips get a new revision only when
  their lines or advance cut changed. Staff who no longer qualify keep any old draft (rare; delete
  by hand for now).
- Paying is per finalized payslip for whatever is left of net pay; "Pay everyone" uses one mode.
  Partial payments and undo-payment screens come later (the database already supports both).
- "Print payslips" from the design isn't built yet (PDF later).

## 2026-10-23 — Attendance grid

- The grid computes everything with `packages/core` on the server (same inputs the salary run
  will use, via `src/lib/mappers.ts`), so a cell, the Days total and the payslip can't disagree.
- Days/Late/Absent count **up to today** in the current month (future paid offs aren't counted).
- Paid-leave balance for the check: opening = the previous month's `leave_balances.carried`
  (written when that month's salary is finalized; 0 before any finalized month) + this month's
  `earnedLeave`. Clearing a mark (back to unmarked) isn't offered yet; set another status.

## 2026-10-23 — Dates are DD/MM/YYYY everywhere (owner's rule)

- Every date shown or typed in FinCrew and Staffora is **DD/MM/YYYY** (23/10/2026). It overrides
  the design system's voice rule ("Fri, 23 Oct"). Stored dates stay ISO `YYYY-MM-DD`.
- `packages/core`: `formatDisplayDate`, `parseDisplayDate` (also accepts 5/1/2026, 05-01-2026,
  05.01.2026; rejects impossible dates). Apps never format dates with Intl/locale functions.
- Date fields are DD/MM/YYYY **text fields**, not browser date pickers, because pickers follow
  the browser's language (US browsers would show MM/DD/YYYY). A calendar picker that keeps
  DD/MM/YYYY can come later.
- Month headings ("October 2026") are months, not dates, and keep the month name.
- Amounts typed by people go through `parseRupees` (exact, no floats).

## 2026-10-23 — Attendance code shows a QR (owner review)

- **FinCrew shows the code as a QR itself** ("Show QR" on the Attendance code screen, a
  full-screen QR view for the counter that keeps the screen on), replacing PLAN §4.5's "the
  system only gives a code; I make my own QR". Asked for in the owner's comment on the key
  screens. The QR's content is still the plain 6-digit code, so `parseScannedCode` and any
  other QR generator keep working. "Copy code" is gone from that screen.

## 2026-10-23 — Phase 4.2 money data

- **The app calculates, the database posts.** Payslips are computed by `packages/core` and saved
  as drafts; `finalize_payslip` posts ledger lines _from the saved payslip_, so the ledger always
  matches what the payslip says. Nobody can write `salary_earned`/`deduction`/`late_deduction`
  lines directly.
- **Re-runs are revisions.** A new payslip for the same run and person becomes the next revision
  (only after the previous one is final; one draft at a time). Finalizing posts the differences
  as `adjustment` lines with `adjusts` = the corrected type, dated the day of the re-run.
- **Advances live in their own table** (given / repaid) and each row posts its ledger line by
  trigger. Cash repaid is a positive `advance` line. Outstanding = given − repaid − cuts on the
  latest final payslip revisions.
- **The advance limit is enforced by the database**: over the limit is refused unless the row says
  `over_limit_confirmed` (the app's confirmation step).
- **Monthly advance cut is a staff setting** (`staff.advance_cut_paise`, null = decide at each run),
  in keeping with "no hard-coded rules".
- **Payments are capped** at the payslip's net pay (net of reversals); undo needs
  `salary.undo_payment` and works for any line (exact opposite, once).
- **Sign rules per ledger type** are database checks (e.g. payments negative, earned positive).
- Advisor fixes folded in: `people_read` uses `(select auth.uid())`; composite FKs from 4.1 got
  covering indexes.

## 2026-10-23 — Phase 4.1 data model

- **Composite foreign keys for shop safety:** child rows reference `(shop_id, staff_id)`,
  `(shop_id, template_id)` etc., so cross-shop links are impossible in the database, not just
  blocked by policy.
- **Late minutes aren't stored** on attendance (PLAN §5 listed `late_minutes`): `packages/core`
  computes them from check-in and the shift in effect, so they can't go stale.
- **Staff rows can't be deleted**; people leave via `leaving_date` / `status = 'left'`, which
  keeps history and the ledger intact.
- **Holidays** are managed with `settings.leave_templates` (no separate permission in PLAN §3).
- **Template assignment** is part of staff setup, so it needs `staff.edit`.
- **Attendance by date:** `attendance.mark` covers today and later; earlier days also need
  `attendance.edit_past` (IST "today" from `private.today_ist()`). Staff can't mark themselves
  through the API; self check-in will go through an edge function.
- Template version rule fields (`carry_over`, `sandwich`, `accrual`, `weekly_offs`) are jsonb in
  `packages/core`'s shapes, with defaults matching core's defaults; the app validates them with
  core before writing. Staff overrides of late policy and pay rules are jsonb on pay settings.
- Hourly "hours per day" is stored as `day_minutes` (integer).

## 2026-10-23 — Multi-shop

Owner asked for multi-shop options (PLAN originally said one shop).

- **One login, many shops.** A login has one `people` row per shop it belongs to, each with its
  own name, roles and owner flag (`unique (shop_id, auth_user_id)`). An owner can run several
  branches; a supervisor can be a supervisor in one and plain staff in another.
- **Every check is per shop.** RLS helpers take the row's shop:
  `private.has_permission(shop_id, key)`, `private.is_owner(shop_id)`, `private.is_member(shop_id)`,
  `private.person_id(shop_id)`. There is no "current shop" in the database; the apps pick one
  (website: `fincrew_shop` cookie, falling back to the first shop) and RLS still decides access.
- **Creating shops:** `create_shop(name, owner_name)` replaces `setup_shop`. On a fresh install
  anyone signed in can create the first shop (first-run setup); after that only someone who owns
  a shop can add one, and becomes its owner. Public sign-ups stay off.
- **Everything else is per shop:** settings (`shops.settings`), leave templates, roles, holidays,
  staff and money. Copying settings/templates between shops and cross-shop reports come later.
- `my_permissions(p_shop)` now takes the shop.
- Rewriting the policies also split the overlapping "for all" write policies into
  insert/update/delete and added the missing foreign-key indexes (advisor notes).

## 2026-10-23 — No hard-coded rules: everything is a setting

Owner's instruction: every value is customisable by the admin, and staff may have no leave.

- **Every business rule is a setting** with a default (`packages/core/src/settings.ts`,
  `LatePolicy`, leave template versions, `CodeSettings`). The full list with options and
  defaults is the settings reference in `docs/features/core-rules.md`. The engine never decides a
  rule on its own; adding a rule means adding a setting.
- **Three levels:** shop-wide (`shops.settings` → `resolveShopRules`), per leave template version
  (leave, weekly offs, sandwich, accrual), and per staff member (pay settings may override any pay
  rule or late-policy field for that person).
- **Staff with no leave** are supported two ways: no template (no weekly offs, no paid leave, bank
  lapses, paid leave can't be marked) or a template with 0 paid leaves and/or no weekly offs.
- **Defaults** keep the earlier Phase 2 interpretations, now changeable: holiday wins over a weekly
  off; working an off day pays the off day plus an extra day; unmarked days unpaid (with a
  warning); sandwich only on `absent`, both sides, weekly offs only; full leave accrual;
  half-day conversion doesn't use a free late day; late minutes counted from shift start, charged
  per minute; day rate = salary ÷ days in the month; lockout 5 wrong codes / 10 min / 10 min wait.
- **Fixed by design, not settings:** integer paise and one rounding per payslip line (PLAN §4.1);
  IST dates; append-only ledger; advance cut never makes net pay negative; the advance cut is a
  payslip line, not a ledger line (the advance is already on the ledger when given; a cut line
  would count it twice); payslip lines carry kinds and names, not text (i18n).
- `resetMonth` is the LAST month of the leave year; lapse or payout happens at its end.
- A month uses the staff overrides in effect on its last day of employment.

## 2026-10-23 — Design lives in Claude Design

- **All UI design is kept in Claude Design**, as one Design System artifact (tokens, brand book,
  components, icons), with key screens to follow as Design artifacts built on it. Link and how
  to read it: `docs/DESIGN.md`.
- **`tokens.json` in that artifact is the source of truth for tokens**; `packages/ui` is
  generated from it in Phase 3, never hand-edited to diverge.
- **Money logic stays in `packages/core`**: the design system's `formatPaise` is a preview
  helper; app code formats money with `packages/core`.
- Accents: FinCrew "Peacock" (cool petrol), Staffora "Marigold" (warm yellow). Fonts: Anek
  Latin / Tamil / Devanagari, one design across the three scripts.

## 2026-10-23 — Function exposure (security advisor)

- **Internal functions live in a `private` schema** that PostgREST doesn't expose:
  `current_person_id`, `current_shop_id`, `is_owner`, `has_permission` and the trigger functions.
  Only functions the apps call live in `public` (`my_permissions`, `setup_shop`, `shop_exists`,
  `ping`); a test pins that list.
- **New functions get no execute grant for anon/PUBLIC by default** (default privileges changed).
  Each migration grants what it needs explicitly. Policy helpers must be granted to
  `authenticated`, because RLS runs as the signed-in user.
- **Remaining advisor warnings are accepted:** `authenticated` can call `my_permissions`,
  `setup_shop`, `shop_exists` (intended; they guard themselves) and the private helpers (needed
  by RLS, not reachable over the API). `rls_auto_enable` is Supabase's own event-trigger function
  for auto-enabling RLS; left alone. Leaked-password protection is an Auth dashboard setting
  (may need a paid plan); owner chooses.
- **The shop's audit row has no actor**: `setup_shop` inserts the shop before the owner's person
  row exists. The owner row right after it carries the actor.

## 2026-10-23 — Live project checks

- ~~Helper functions stay callable by anonymous users~~ — superseded the same day by the
  `private` schema move above.
- **Generated `packages/db/src/database.types.ts` is committed and excluded from Prettier**, so
  regenerating only shows real schema changes in diffs.

## 2026-10-23 — Migrations deploy from GitHub

- **Migrations apply automatically** from the `migrate` job in `.github/workflows/ci.yml` on
  push to `main`, only after the migration check, typecheck, tests and build pass. Chosen over
  Supabase's own GitHub integration so the RLS tests gate every deploy.
  _Revisited 2026-10-23, kept:_ the integration deploys on push regardless of CI, so it only keeps
  that gate if every change goes through a PR with branch protection. The owner pushes straight
  to `main`, so the Actions job stays. Switch only together with a PR workflow; never run both.
- **Everything on `main` in `supabase/migrations/` is treated as applied and immutable.**
  `scripts/check-migrations.sh` fails CI if one is modified, deleted or renamed, or if a new
  file's timestamp sorts before the newest existing one. Fix mistakes with a new migration.
- CI runs on `main` are never cancelled mid-way (a migration may be running); branch runs are.
- Shows a `--dry-run` of pending migrations before applying, so the Actions log records what ran.
- **No local link / DB password needed.** `pnpm db:types` uses the project ref and the CLI login.
  The DB password lives only in GitHub secrets (and your password manager).

## 2026-10-22 — Phase 1

- **Owner bootstrap via `setup_shop()`.** The first signed-in user creates the shop and becomes
  owner; it refuses once any shop exists. Public sign-ups are off, so only logins you create in
  Supabase can reach it. Owner rows can only be inserted while `setup_shop` sets the
  `fincrew.bootstrap` flag.
- **Owner protection lives in a trigger**, not just policies: the owner can't be deleted or demoted,
  nobody can be promoted, people can't move shops.
- **`shop_id` duplicated on `role_permissions` and `person_roles`** so policies stay simple
  (`shop_id = current_shop_id()`); a trigger checks it matches the role/person.
- **RLS helpers are `SECURITY DEFINER` with `search_path = ''`**, so policies call them without
  recursive RLS and without search-path hijacking.
- **Audit log** is written by a `SECURITY DEFINER` trigger; users have no insert/update/delete
  grant, and a trigger rejects UPDATE/DELETE even for the database owner (append-only).
- **Permission keys** are dotted strings (`staff.pay.edit`) in a `permissions` table, mirrored in
  `packages/core/src/permissions.ts`; a test fails if they drift.
- **DB tests run on PGlite** with a small stub of Supabase's `auth` schema and API roles, because
  Docker isn't available on the dev machine. Tests switch to the `authenticated` role with a JWT
  subject, as PostgREST does.
- **Tables arrive with the phase that uses them**, not all at once, so each lands with its RLS tests.
- **TypeScript 5.9**, not 7: Next.js and Expo tooling still expect the JS compiler API.
- **Workspace packages ship TS source** (no build step); Next transpiles them via
  `transpilePackages`, Expo/Metro will too.
- **Next.js 16 `proxy.ts`** (formerly middleware) refreshes the Supabase session and redirects
  signed-out users. Server code uses `auth.getClaims()` (verifies the JWT), never `getSession()`.
- **Keep-awake** calls a harmless `ping()` RPC every 3 days from GitHub Actions.
- **Placeholder look**: a neutral theme with CSS variables until the design phase (Phase 3).
