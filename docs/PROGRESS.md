# Progress

_Last updated: 2026-10-24 (evening)_

## Start here (handover for a new session)

_Handover written 2026-10-24 (evening) before the owner reset the session. Read this section
first, then `CLAUDE.md`, then the feature doc for whatever you touch._

**Where we are**

- **Website** (https://fincrew-web.vercel.app, `docs/features/fincrew-web.md`): **complete for
  every owner flow and live**: dashboard (with requests banner), attendance grid + phone day view,
  attendance code page (`/code`, `/qr`), requests (`/requests`), staff (detail tabs, helpers,
  opening balance, Staffora sign-in card: phone number as user id / reset PIN / unlock / new
  phone / code check-in switch), salary run + payslips, advances, expenses + categories,
  reports, settings, roles. **The owner can start using the website now.**
- **FinCrew Android** (`apps/fincrew-mobile`, `docs/features/fincrew-mobile.md`): Today (+
  attendance code button, requests banner), Staff (detail with Give advance / Pay), Money
  (expenses with bill photo, salary run, advances), Attendance code screen, Requests, More. All
  checked on live in the browser preview, including salary finalize + pay end to end. **Not on a
  phone yet** (needs EAS builds + the owner's Expo account, which they'll create once the apps
  are complete).
- **Staffora** (`apps/staffora-mobile`, `docs/features/staffora.md`): **sign in with the phone
  number + a PIN chosen the first time** (since 2026-10-25; invite links removed), PIN on every
  open or fingerprint, Home with check-in by code / QR and the newest payslip, checked-in screen,
  Attendance calendar, Money (ledger, payslips, payslip page + share), Ask for leave / advance
  with my requests and cancel, Me (change PIN, fingerprint, lock, remove). Home, Attendance,
  Money, Payslips, Ask were checked on live on 2026-10-24 with the owner's Test Staff sign-in;
  the preview has since lost it. Not tried on live: the phone sign-in, change PIN, payslip card,
  share, sending a request, checking in (requests / check-ins leave permanent rows — ask
  first), Lock / Remove, fingerprint (needs a real phone).
- **Database / server**: Phase 7 data live (`docs/features/staff-self-service.md`): attendance
  codes + `check_in`, scans log, requests, bcrypt PINs, `staff-auth` edge function (deployed
  by CI), staff read their payslip's run, phone + PIN sign-in, change PIN. All migrations up to
  `20261025000002_phone_login.sql` and the new `staff-auth` (lookup / setup / login) are live
  (CI run 40165654747, 2026-10-25).
- Shared code: `packages/core` (rules incl. `evaluateCheck`, `evaluatePinAttempt`, `staffLogin`
  settings), **`packages/data`** (used by the website and both apps: attendance month / write,
  session, staff loaders, expenses + saving, salary month + run / finalize / pay, payslip loaders
  `loadMyPayslips` / `loadPayslipView`, advances, reports, roles, leave setup, self-service:
  code, check-ins, requests + `decideRequest`, logins / reset PIN, payslip share text, pay and
  advance-rule saving `savePay` / `saveAdvanceSettings`, part payments in `paySalary`).
- **Git:** everything up to `ffe45f1` is pushed (CI run 40165654747 green, Vercel deployed).
  Working from another
  PC: `docs/NEW-MACHINE.md`. The owner pushes, or
  tells you to push in that moment. Pushing `.github/workflows` changes needs the `workflow`
  scope — the owner added it to the GitHub CLI sign-in, which git now uses.

**Next work, in order** (agreed with the owner 2026-10-24; they usually say "continue")

1. **Finish Staffora**: built on 2026-10-25 — phone + PIN sign-in (replaces invite links),
   fingerprint opening, change PIN, Home payslip card, share a payslip; pushed and live
   2026-10-25. Left: live checks with the owner: add
   Test Staff's phone number in FinCrew, New phone + Reset PIN on their sign-in card, the owner
   types the number + a new PIN in the Staffora preview; then change PIN, Home card, Share, and
   (with their OK — permanent rows) sending a request and checking in.
2. **FinCrew app gaps**: built on 2026-10-25 — payslip on WhatsApp (pay sheet tick, Send
   payslip, Share payslips), pay part of a payslip, undo a ledger line, change pay from a date,
   advance rules. Pushed and live (1edc131). Left: check them in the app preview with the owner signed in
   (paying / undoing on live writes permanent lines — ask first; opening the sheets and
   cancelling is fine), bill photo upload on a real phone. Still website-only: allowances,
   deductions, leave template, own rules.
3. **Plan pieces not built yet**: staff documents (`staff_documents` + storage, PLAN §6.1 staff
   detail "Documents"), add staff from the app (stepper: details → pay → template → shift →
   invite), website audit log viewer (PLAN §6.2), dashboard "recent activity". Also move the
   website's staff detail page and payslip page onto the shared loaders when next touched.
4. **Push notifications** (PLAN §6.4): `push_tokens` table, expo-notifications; Android needs a
   free Firebase project + the owner's Expo account.
5. **Polish (Phase 8)**: widgets, Tamil/Hindi, offline attendance marking, StaffBook import,
   backup/export. (App icons are done: FinCrew "Rupee ring", Staffora "Staff badge".)
6. **Install builds**: EAS for both apps with the owner's Expo account (package ids
   `app.fincrew.mobile` / `app.staffora.mobile` are placeholders), APK or Play Store.

The owner may ask to move 4 + 6 earlier so staff can use Staffora sooner — offer that.

**Owner's answers (2026-10-24)**

- Finalizing and paying **Test Staff's October salary** on live: **allowed** (done). Other
  permanent writes (giving advances, undoing payments, sending requests, check-in scans) still
  need their OK each time.
- Real leave templates, pay rules and expense categories: the owner sets them up **later**;
  samples may be used for testing.
- Leaked-password protection: **not needed** (open source, self-hosted); the advisor warning stays.
- Expo account / phone installs: **once the apps are fully complete**.
- Still open: reviewing the rule defaults (`docs/features/core-rules.md`).
- Before real use the owner should: set up templates / rules / categories, add real staff, and
  **mark Test Staff as left** (it can't be deleted any more), and save each staff member's
  10-digit mobile number (it is their Staffora user id; the first one to type it sets the PIN).

**Live test data**: Test Staff (person `55e7a159-1a4b-4615-a1a3-bdbbcdc6b304`; joined
23/10/2026, ₹22,000 monthly, 9:30 AM – 8:30 PM, advance limit ₹5,000 / cut ₹1,000; attendance
23/10 half day, 24/10 present (marked by the owner); **October salary finalized and paid**
₹1,065.00 by UPI — ledger +₹1,065 (31/10) / −₹1,065 (24/10), so Test Staff can't be deleted;
**has a Staffora sign-in** (auth user `staff-<person id>@fincrew.invalid`, bound to an old
preview browser's device id) with the owner's PIN but **no phone number saved** (needed for the
new phone sign-in); self attendance off; three decided requests whose
notes start "TEST:" — requests can't be deleted). An archived "Test category". The shop's
attendance code exists (made while checking). Everything else tested was reverted.

**Owner rules (also in CLAUDE.md and memory)**: no co-author on commits; the owner pushes (push
only when asked in that moment); docs in every commit; every rule is a setting (no
hard-coding); dates DD/MM/YYYY everywhere; all strings via i18n (no English fallbacks in code);
design in Claude Design first for new screens (`docs/DESIGN.md`); never type the owner's
password or PIN; never create real sign-ins or write permanent rows on the live shop without
their OK.

**How to check work**

- `pnpm typecheck` (9 tasks incl. both apps), `pnpm test` (core 236, ui 6, i18n 1, db 166 —
  PGlite, no Docker), `pnpm build`, `pnpm ui:tokens --check`,
  `bash scripts/check-migrations.sh origin/main HEAD`.
- Live DB (CLI logged in): `pnpm exec supabase db query --linked --project-ref
ufmlqvvfznemghmnvynz "<sql>"`; advisors: `... db advisors --linked --project-ref
ufmlqvvfznemghmnvynz --type all` (accepted warnings only: authenticated-callable
  `create_shop`/`finalize_payslip`/`my_permissions`/`shop_exists` and the Phase 7 owner-side
  functions `attendance_code`/`regenerate_attendance_code`/`check_in`/`reset_pin`/
  `staff_logins`/`unlock_login`/`reset_staff_phone`, Staffora's `change_pin`,
  Supabase's
  `rls_auto_enable`, leaked-password protection). **Dry-run a new migration** on live before
  asking to push: write `begin; <migration> select 'applied'; rollback;` to a file and run
  `... db query --linked --project-ref ufmlqvvfznemghmnvynz -f <file>`.
- Previews (`.claude/launch.json`): "fincrew-web" (:3000), "fincrew-mobile-web" (:8081),
  "staffora-mobile-web" (:8082). Expo's first bundle takes ~1 min — poll with curl until 200, and
  wait a few seconds more before reading the page (it's empty until the bundle runs). The owner
  signs in to FinCrew (website + app); in Staffora the owner is joined as Test Staff — **a page
  reload asks for the PIN again**, so move around with in-app clicks (tab links `a[href=/money]`
  etc.), never `navigate` while testing Staffora.
- In the apps, RN `accessibilityLabel` becomes `aria-label` and Pressables are `role=button`;
  drive them with JS clicks. Pane screenshots can look scaled or stale — read text / measure with
  JS. The owner sometimes clicks in the pane: use a background tab (`tabs_create`) for your own
  checks.
- After a pushed migration: `gh run watch <id>`, then `pnpm db:types` and commit the types.
  Vercel status: `gh api repos/vikashpatel04/Employee-and-Expense-Management-Tool/commits/<sha>/status`.

**Gotchas seen so far**

- Website speed: the Vercel function region must match Supabase's (`bom1` ↔ `ap-south-1`,
  `apps/fincrew-web/vercel.json`). `curl -sI <page>` → `x-vercel-id: bom1::<function region>::…`.
- Long Bash heredocs often fail to parse in this tool: write scripts/JSON edits with the Write
  tool into the scratchpad and run them. Python on Windows writes CRLF unless
  `open(..., newline='')`. Windows sometimes locks `common.json` for a moment (EUNKNOWN): retry.
- Prettier re-pads Markdown tables: edit table rows with a regex, not exact strings.
- Next.js: stale server bundle / `.next/types` after moving routes → stop preview, delete
  `apps/fincrew-web/.next`. Page files may only export the page (move helpers to `src/lib`).
- React 19 resets `<form action>` forms after the action: use `useFormAction`
  (`src/lib/use-form-action.ts`); for multi-button decisions call the action from a click.
- Anything exported from a `'use server'` file is a callable endpoint; server components can't
  take plain values (maps, objects) from `'use client'` files — keep those in `src/lib`.
- HTML `pattern` uses the `v` flag (`dateFieldProps` uses `String.raw`).
- jsonb reorders keys → `sameJson`. Composite FKs → cross-shop rows fail with `foreign key`.
- RLS joins: an embedded table the user can't read drops the row (`!inner`) — e.g. staff and
  `salary_runs` (fixed by `20261024000006`). Check every table in a select for the weakest user.
- Before-insert triggers run before RLS checks; triggers that look up other tables need
  `security definer` to see them (e.g. `private.guard_request`).
- Append-only tables (requests, ledger, advances, scans, audit) can't be cleaned up after a live
  test — and disabling their guard is blocked as tampering. Ask before creating such rows.
- The attendance stamp trigger keeps self check-ins as source `self` through the transaction flag
  `fincrew.self_check` (set by `private.check_in_at`).
- New public SQL functions go in `supabase/tests/functions.test.ts`'s pinned list. The PGlite
  harness has a `storage` stand-in and loads `pgcrypto` into an `extensions` schema like Supabase.
- `supabase/functions/<name>/handler.ts` is plain TS (tested from `supabase/tests`);
  `index.ts` is Deno (not typechecked locally). Edge function deploy: CI step with `--use-api`.
- Creating a staff sign-in on live (typing a staff phone number and a first PIN in Staffora)
  counts as creating an account: the owner does it, not you. Loading scripts from a CDN into a page is blocked.
- Expo: add native libraries with `npx expo install` (from the app folder); pnpm isolated
  installs work; the apps keep Expo's TypeScript 6. One React version inside each app. After
  adding a **new folder** under `src/` or a new package, restart that app's preview.
  react-native-svg passes `accessible` to the web DOM: put labels on a wrapping `View`.
- Design canvases: read with the Artifact tool (`project/canvas.json` + artboard files); a
  publish can be refused if the canvas was opened in the browser meanwhile — read the artifact
  (url only) again, reapply, publish. Free spots: FinCrew light row next x ≈ 7520 (y 0), web
  row next x ≈ 11910 (y 2528); Staffora light row next x ≈ 5640 (y 0).

**Key links**: FinCrew screens https://claude.ai/artifact/WydRUvQzCNMAoXcNVh7pWC · Staffora
screens https://claude.ai/artifact/9YMxty5q9jFvuut8ay8dTe · Design system
https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP · Website https://fincrew-web.vercel.app ·
Repo https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool · Supabase project
ref `ufmlqvvfznemghmnvynz` (never touch `cheque-tracker-dev`).

## Phase status (docs/PLAN.md §8)

| #   | Phase                        | Status                                                                                                                                                                      |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation                   | **Done** (2026-10-23)                                                                                                                                                       |
| 2   | Core logic (`packages/core`) | **Done**: 225 tests, every rule a setting; `docs/features/core-rules.md`                                                                                                    |
| 3   | Design                       | **Done** (2026-10-23): design system, key screens (owner reviewed), `packages/ui` tokens                                                                                    |
| 4   | FinCrew web core             | **Done** (2026-10-24): data layer live; screens slices 1–10 (dashboard, shell, staff + extras, attendance grid + CSV, salary run, payslip print, advances, settings, roles) |
| 5   | FinCrew Android              | **Built** (Today, Staff, Money, code, requests), checked live in the browser; phone builds wait (EAS)                                                                       |
| 6   | Expenses                     | **Done** (2026-10-24): website and Android                                                                                                                                  |
| 7   | Staffora                     | **In progress**: data + FinCrew screens live; Staffora app slices A + B checked; change PIN etc. next                                                                       |
| 8   | Polish                       | Not started                                                                                                                                                                 |

## Phase 1 — Foundation

Done:

- [x] Turborepo + pnpm monorepo (`apps/`, `packages/`, `supabase/`), MIT licence
- [x] Packages: `core` (money in paise, ₹ Indian formatting, half-up rupee rounding, IST business
      dates, permission keys), `db` (placeholder types), `ui` (placeholder), `i18n` (i18next, English)
- [x] Migration `20261022000001_foundation.sql`: `permissions`, `shops`, `people`, `roles`,
      `role_permissions`, `person_roles`, `audit_log`; helpers `current_person_id()`,
      `current_shop_id()`, `is_owner()`, `has_permission(key)`, `my_permissions()`; RLS on all
      tables; owner protection; append-only audit log; `setup_shop()`, `shop_exists()`, `ping()`
- [x] RLS test harness on PGlite + 21 tests (owner / Supervisor role / staff / stranger / anon)
- [x] Migration `20261023000001_harden_functions.sql` (after the Supabase security advisor):
      helpers + trigger functions moved to a non-exposed `private` schema; anon can call only
      `ping()`; future functions not executable by anon/PUBLIC by default; `ping()` search_path
      fixed. 7 more tests (28 DB tests total)
- [x] FinCrew web (Next.js 16): email+password sign-in, first-run "Set up your shop", home page,
      sign-out, session refresh in `src/proxy.ts`
- [x] Supabase `config.toml` with public sign-ups disabled
- [x] GitHub Actions: `ci.yml` (migration immutability check, typecheck, test, build, then
      **migrate** job applying migrations to the live project on push to `main`) and
      `keep-awake.yml` (pings every 3 days)
- [x] Root scripts: `pnpm db:login`, `pnpm db:types` (no local link or DB password needed)
- [x] Owner accounts and live setup (steps in `docs/SETUP.md`):
  - [x] Create the Supabase project (sign-ups off), access token
  - [x] Create the GitHub repo, add the 5 secrets, push `main` → migrate job applied foundation
        (CI run 39898016456, 2026-10-23)
  - [x] Verify live DB: 7 tables + 8 functions present (from generated types); anonymous API
        calls refused on every table, insert, `setup_shop`, `shop_exists`; `ping()` answers
  - [x] Owner login created; signed in locally; shop set up ("Dhanalakshmi Textiles", owner
        Dinesh Patel). Verified in DB: 1 shop, 1 owner linked to the login, 22 permissions,
        2 audit rows, second `setup_shop` refused
  - [x] Hardening migration applied (CI run 39901338816); advisor rerun: only the accepted
        warnings remain (see DECISIONS 2026-10-23); helpers now 404 on the API; owner still
        has 22 permissions
  - [x] Vercel: https://fincrew-web.vercel.app (root `apps/fincrew-web`, 2 env vars, Supabase
        integration deliberately not added). Checked: signed-out `/` and `/setup` → 307 to
        `/login`; no secrets in any client JS chunk (Supabase is only called server-side); owner
        signed in on the live site and sees the home page; Site URL set in Supabase Auth
  - [x] `pnpm db:types` (real types committed), cast removed from `session.ts`

Verified: `pnpm typecheck`, `pnpm test` (49 tests), `pnpm build`; end-to-end sign-in and shop
setup against the live project, and sign-in on the Vercel deployment (2026-10-23).

## Migrations applied to the live project

| Migration                             | Applied    | How                             |
| ------------------------------------- | ---------- | ------------------------------- |
| `20261022000001_foundation.sql`       | 2026-10-23 | CI migrate job, run 39898016456 |
| `20261023000001_harden_functions.sql` | 2026-10-23 | CI migrate job, run 39901338816 |
| `20261023000002_multi_shop.sql`       | 2026-10-23 | CI migrate job, run 39950298454 |
| `20261023000003_staff_attendance.sql` | 2026-10-23 | CI migrate job, run 39950298454 |
| `20261023000004_money.sql`            | 2026-10-23 | CI migrate job, run 39953812217 |
| `20261023000005_add_staff.sql`        | 2026-10-23 | CI migrate job, run 39968572884 |
| `20261024000001_expenses.sql`         | 2026-10-24 | CI migrate job                  |
| `20261024000002_advance_undo.sql`     | 2026-10-24 | CI migrate job                  |
| `20261024000003_attendance_codes.sql` | 2026-10-24 | CI migrate job, run 40098230155 |
| `20261024000004_requests.sql`         | 2026-10-24 | CI migrate job, run 40098230155 |
| `20261024000005_staff_login.sql`      | 2026-10-24 | CI migrate job, run 40098230155 |
| `20261024000006_staff_read_runs.sql`  | 2026-10-24 | CI migrate job, run 40104302836 |
| `20261025000001_change_pin.sql`       | 2026-10-25 | CI migrate job, run 40165654747 |
| `20261025000002_phone_login.sql`      | 2026-10-25 | CI migrate job, run 40165654747 |

Migrations are applied by the CI **migrate** job on every push to `main`, so **everything in
`supabase/migrations/` on `main` counts as applied** and must never change (CI enforces this).

GitHub repo: https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool
Website: https://fincrew-web.vercel.app (Vercel, auto-deploys on push to `main`)
Supabase project: `employee-expense-management`, ref `ufmlqvvfznemghmnvynz` (Mumbai). The ref
lives in the git-ignored root `.env` for `pnpm db:types`.

## Next up

See **Start here** at the top for the ordered list.

Open items (low priority, fold into the next migration that touches these tables):

- GitHub Actions warn that `actions/checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`,
  `supabase/setup-cli@v1` run on deprecated Node 20; bump when newer majors are available.
- Leaked-password protection in Supabase Auth: not needed (owner, 2026-10-24).

Tables still to add (with the phase that uses them, each with RLS tests): `staff_documents`
(storage), `push_tokens` (Phase 7/8).

## Session log

- **2026-10-25** — **Website page grid** (owner: "weird cards alignment… proper grid or bento").
  `src/components/app/layout.tsx` (`StatGrid`, `StatCard`, `Bento`, `Panel`, `PanelList`,
  `PanelEmpty`); dashboard, expenses, advances, reports, salary, staff page (Overview, Ledger,
  Pay), requests / code (equal heights), settings (categories and leave as card grids, holidays
  full width) moved onto it. Typecheck 9/9, build OK. Checked the grid's geometry on a temporary
  local page (equal stat widths, panels in a row equal height). Then with the owner signed in
  in the preview: measured every page at 1366 px and fixed what didn't line up (staff toolbar,
  sign-in card style, staff Attendance and Ledger tabs, settings roles and rules); opened Give
  advance and closed it (nothing saved).

- **2026-10-25** — **Website rework** (owner: whole page scrolled with the sidebar, too roomy,
  forms as cards in pages, no loading, "use shadcn everywhere with our theme"). shadcn/ui
  (radix, `src/components/ui`) mapped onto the tokens; web scale in `globals.css`; fixed shadcn
  Sidebar shell; `src/components/app`: `PendingLink` (top bar, `NavDim`, link spinners),
  `TabLinks` + keyed Suspense skeletons, `FormDialog` / `useDialogDone`, `FormSubmit`,
  skeletons; `aria-busy` button spinners; sonner toasts. Forms moved into dialogs on staff list,
  staff page (header + Overview + Pay), expenses, settings (categories, holidays, leave, roles);
  salary Finalize / Pay confirm in dialogs. Typecheck 9/9, website build OK, tests unchanged.
  Checked in the browser: sign-in page, and on a temporary local page (deleted) the shell (only
  the content scrolls), Add staff dialog (opens, Cancel closes), the phone menu. **Not seen
  with real data** — every signed-in page needs the owner's sign-in.

- **2026-10-25** — Pushed the Staffora work (CI run 40165654747: both migrations, new
  `staff-auth` live; types regenerated). **FinCrew app gaps**: `packages/data` `pay-write.ts`
  (`savePay`, `saveAdvanceSettings`, now also behind the website's actions), `paySalary`
  `amount` (part payment), `loadSalaryRun` phone, `loadPay` `dayMinutes`. App: Ledger Undo
  with a confirm sheet; salary run pay sheet with amount + "Send the payslip on WhatsApp",
  Send payslip per person, Share payslips sheet (`src/lib/share-payslip.ts`, `wa.me` or the
  share sheet); Pay tab Change pay from a date (`pay-change.tsx`) and Advance rules sheet;
  Checkbox moved to `form.tsx`. Typecheck 9/9, tests core 236 / db 166, website build OK. Not
  yet seen in the preview (needs the owner's FinCrew sign-in).

- **2026-10-25** — App icons from the design system, the owner's choice: FinCrew "B · Rupee
  ring", Staffora "B · Staff badge". Sources in `packages/ui/design/app-icons/`, PNGs made by
  `pnpm ui:icons` (sharp, root dev dependency): Expo icons, Android adaptive + monochrome,
  splash (mark now 160 wide), favicons; the website gets its first favicon (`icon.svg`,
  `apple-icon.png`). Checked as a contact sheet; website builds with both icon routes.

- **2026-10-25** — **Staffora sign-in by phone number** (owner: "no staff is going to self
  on-board"). Core `phoneKey` + `allowBiometrics` (tests first); migration
  `20261025000002_phone_login.sql`: `phone_lookup`, `pin_setup`, `reset_pin`, `pin_login` says
  `no_pin` after a reset, `staff_logins` without invites, invites dropped (tests rewritten,
  phone-key parity test). `staff-auth`: `lookup` / `setup` / `login`. Designs: Staffora "Sign in
  with phone · first run", "PIN to open" (fingerprint), FinCrew "Web · staff sign-in card".
  Website card (user id, Reset PIN), `/join` page removed, settings switch for fingerprint.
  Staffora Welcome (phone → hello → PIN twice, or enter PIN), PIN screen (fingerprint, new PIN
  after reset), Me fingerprint switch (`expo-local-authentication`). Typecheck 9/9, build OK,
  tests core 236 / db 166. Checked in the preview: the Welcome screen and the 10-digit check;
  the rest needs the push (edge function). Not pushed: the owner asked to wait.

- **2026-10-25** — **Finish Staffora (built).** Change PIN: `change_pin` SQL function (tests
  first: 5 in `staff-login.test.ts`, dry-run on live OK) + Me → Change PIN screen (same pad as
  Join). Home payslip card (design "Home") via `loadMyPayslips` (+ `finalizedAt`). Share payslip
  (`payslipShareText` in `packages/data`, RN share sheet). The preview lost the owner's Staffora
  sign-in (it showed Welcome), so these weren't checked with live data yet. Typecheck 9/9,
  tests core 234 / ui 6 / i18n 1 / db 165.

- **2026-10-25** — Owner found the live website slow (3–5 s per click). Cause: Vercel ran the
  server in Washington (`iad1`, seen in `x-vercel-id`) while Supabase is in Mumbai, and each
  page makes several database trips. Fix: `apps/fincrew-web/vercel.json` region `bom1`,
  `(app)/loading.tsx`, `requireMe` cached per request. Takes effect after the push (Vercel
  redeploys); check `x-vercel-id` shows `bom1::bom1::` on a dynamic page. Also more
  `.gitignore` rules.

- **2026-10-24** — Owner continuing tonight on another PC: added `docs/NEW-MACHINE.md` (setup,
  env files, what doesn't carry over, switching back) and an **Owner rules** section in
  `CLAUDE.md` (the rules that were only in Claude's memory on the first PC).

- **2026-10-24** — Owner resetting the session: rewrote **Start here** (state of all three
  apps, what the owner can use now, next work in the agreed order, live test data, checks,
  gotchas).

- **2026-10-24** — Owner joined Staffora as Test Staff (PIN set by them). Checked Home,
  Attendance, Money, Ask with live data (details in `docs/features/staffora.md` → Checked). Fixed
  Home's text for a day the shop marked; found staff couldn't read their payslip's salary run →
  migration `20261024000006_staff_read_runs.sql` (test first, dry-run on live OK), needs the push.

- **2026-10-24** — **Staffora slice B.** Designs first ("Attendance", "Ask for leave /
  advance, my requests" on the Staffora canvas). Attendance tab, Money tab (ledger / payslips),
  payslip page, Ask screen with my requests; shared `loadMyPayslips` / `loadPayslipView` in
  `@fincrew/data`. Typecheck passes; the app builds; screens not yet seen with data (needs the
  owner's Staffora sign-in).

- **2026-10-24** — **Staffora slice A.** New app `apps/staffora-mobile` (copied setup, Staffora
  palette, `expo-camera`, `expo-crypto`), designs added first ("Join · first run", "PIN to open"
  on the Staffora canvas). Welcome, Join (PIN twice), PIN, Home, Enter code, Scan QR, Checked in,
  Me. Checked in the browser up to the PIN step on live (Join greeted Test Staff through the
  edge function); the rest needs the owner's sign-in. Typecheck passes (9 tasks).

- **2026-10-24** — Owner answered the open questions (recorded under "Owner's answers"). With
  their OK, salary tested end to end on live in the Android app: Run again (₹355 → ₹1,065 with
  today's present), Finalize (asks first), Pay from Test Staff's page (UPI) → balance settled;
  ledger, payslip page, website salary (Paid), dashboard and reports agree. Website salary page
  now hides "Check before finalizing" once the month is finalized (the app already did).

- **2026-10-24** — Pushed Phase 7 (owner added the GitHub `workflow` scope so the CI file change
  could go up). CI run 40098230155: 3 migrations applied, `staff-auth` deployed. `pnpm db:types`
  regenerated. Checked on live: code page / QR / new code (website + app), sign-in card with
  invite → join page through the live edge function, cancel, check-in switch, requests decided in
  both apps (leave approved as unpaid wrote the days). Fixes: app Requests Decided tab (stale note,
  context line), app QR `accessible` prop on web. Test data cleaned except three decided "TEST:"
  requests (can't be deleted).

- **2026-10-24** — **Phase 7 screens.** Design first: new artboards Requests (Android),
  Web · attendance code, Web · requests, Web · staff sign-in card. Shared
  `packages/data/src/self-service.ts`; `writeAttendance` gains `allowFuture` (approved leave),
  `recordAdvance` returns the id. Website `/code`, `/qr`, `/requests`, dashboard banner, sidebar
  links with the waiting count, staff "Staffora sign-in" card, public `/join/<token>` (proxy
  allows `/join/`). App: code screen with full-screen QR, requests screen, Today button + banner.
  `qrcode` added to both apps. Checks: typecheck, tests, build; website still loads. Not pushed;
  the new screens need the push (migrations + edge function) before they can be seen working.

- **2026-10-24** — **Phase 7 data.** Migrations `20261024000003_attendance_codes.sql` (codes,
  check-in in SQL mirroring core `evaluateCheck`, scans log, attendance stamp keeps self
  check-ins), `20261024000004_requests.sql`, `20261024000005_staff_login.sql` (invites, bcrypt
  PINs, lock/wait mirroring new core `evaluatePinAttempt`, owner unlock / reset phone); edge
  function `staff-auth` (+ CI deploy step, `config.toml` verify_jwt off); core `staffLogin`
  settings + website Settings section. Tests: core 234, db 160 (incl. parity tests SQL ↔ core).
  All three migrations dry-run on live in one rolled-back transaction. Not pushed.

- **2026-10-24** — **Phase 5 slice C: Android Money tab.** Moved expense saving, salary
  run/finalize/pay and advances into `@fincrew/data` (website actions now wrap them; salary and
  advances pages use `loadSalaryRun` / `loadAdvanceBalances`). Design first: new artboards
  "Money · expenses / salary / advances" on the FinCrew canvas. App: Money tab (Expenses, Salary,
  Advances), add/edit expense with bill photo (`expo-image-picker`, `expo-image-manipulator`,
  `expo-crypto`), salary run screen, advance sheet; staff detail Give advance and Pay. Checked
  live with the owner's sign-in (details in `docs/features/fincrew-mobile.md`); test category
  re-archived, live data unchanged. Typecheck, tests (core 225, ui 6, i18n 1, db 109) and the
  website build pass.

- **2026-10-24** — Owner compacting the session: rewrote the **Start here** handover (state,
  next work with where the logic to move lives, live test data, checks, gotchas). Local `main`
  2 commits ahead of GitHub.

- **2026-10-24** — Owner signed in on the app (browser preview :8081). Checked Today and Staff
  with live data (details in `docs/features/fincrew-mobile.md` → Checked); all writes reverted.
  Fix: "Mark all present" now confirms even for one person.

- **2026-10-24** — Pushed `32d5d25` + `e44565e` (CI green; Vercel deployed). **Phase 5 slice B:
  Staff tab** — shared loaders `loadStaffList`, `loadStaffOverview`, `loadLedger`, `loadPay` in
  `@fincrew/data`; app Staff list (search, Active/Left/All, today's status) and staff detail
  (Overview, Attendance calendar with Change, Ledger, Pay) per the "Staff detail" design; the
  status sheet is now one shared component. Checked: typecheck/tests/build; signed-out guard.
  Not yet seen with data — needs the owner to sign in on the app.

- **2026-10-24** — **Phase 5 slice A: Android app foundations + Today.** New app
  `apps/fincrew-mobile` (Expo SDK 58, Expo Router, pnpm isolated installs, TS 6 in the app).
  Moved more shared logic into `@fincrew/data`: `loadMemberships` / `loadMe` (website session
  uses them), `paidLeaveShortfall` and `writeAttendance` (set/clear marks with the date and
  paid-leave rules; the website's attendance actions now call it). App: theme from
  `@fincrew/ui`, Anek Latin, Supabase client with the session on the phone, sign-in + guard,
  shop switch sheet, tabs Today · Staff · Money · More, Today screen per the design. Checked in
  the browser at 375 px: starts, signed-out → Sign in, matches the design. Today not yet seen
  with data (owner sign-in needed). Removed the starter's own `.claude/settings.json` (it only
  enabled an Expo plugin) and example screens.

- **2026-10-24** — Owner: "Push it and continue". Pushed `5006ace` (CI green incl. migrate; the
  advance-undo fix is live). **Phase 5 started**: moved the website's data loaders into a new
  shared package `packages/data` (`@fincrew/data`) so the Android app reuses them; website
  imports updated; typecheck, tests and build pass.

- **2026-10-24** — **Slice 13: website extras** (owner: "complete website extras so the app has
  everything it needs to refer"). Staff detail **Attendance** tab (design "Staff detail ·
  Attendance": Monday-first month calendar, chosen day's status / minutes late / in-out times,
  Change = set or clear, month counts). Settings → Roles **Helpers** (people not on the payroll:
  add with name/phone, remove; tagged "Helper" in role people lists). **Opening balance
  correction** (adjustment line for the difference, linked to the opening line, same date;
  needs `salary.run`). **Reports** (designed first, "Web · reports"): 3/6/12 months, tiles, month
  by month (salary gross incl. drafts tagged, paid to staff minus undone, advances given net of
  repaid minus undone, shop expenses, total cost) with bars, shop expenses by category × month,
  CSV; sidebar with `reports.view`. **Bug fixed:** undoing an advance reversed its ledger line
  but the outstanding advance still counted it → `private.advance_outstanding` ignores advances
  whose line was reversed (2 new DB tests; dry-run on live, rolled back). Fix: a hidden table
  label made Reports 597 px wide on phones (scroll boxes are now `relative`). Checked on the live
  shop: attendance tab mark/clear, helper add/remove, reports and CSV, phone widths; DB back to
  the one 23/10 half day and no helper. Opening correction not tried live (Test Staff has no
  opening balance; setting one is permanent).

- **2026-10-24** — Owner: "Push it". Pushed `862e1f1` (dashboard, small screens, expenses); CI
  green incl. migrate; live DB has `expenses`, `expense_categories`, private `bills` bucket with
  3 policies; advisors unchanged (only the accepted warnings). `pnpm db:types` regenerated.
  **Checked on the live shop:** added "Test category" (wrench, amber), added a ₹123.45 UPI shop
  expense with a generated bill photo (stored as a 101 KB JPEG at `<shop>/<expense>-<time>.jpg`),
  opened the bill via its signed link, CSV row, edited to ₹200 (dashboard tile followed),
  phone widths, deleted it (bill file removed; 0 expenses, 0 bill files, 0 expense ledger lines
  left). "Test category" stays **archived** (categories can't be deleted). Staff charge and
  pay-back were not tried live (they'd put permanent lines on Test Staff's ledger); the DB tests
  cover them. Fix: "Add the usual ones" also shows when every category is archived.

- **2026-10-24** — **Slice 12: expenses** — migration (categories, expenses, ledger posting
  trigger with reverse-and-repost on change, RLS, private `bills` bucket + Storage policies),
  17 DB tests (Storage stand-in added to the PGlite harness), migration dry-run on the live DB in
  a rolled-back transaction (applies cleanly; nothing kept). Web: Expenses page (tiles, by
  category, list, add/edit side panel with photo shrinking, CSV), Settings → Expense
  categories (icons, colours, archive, "Add the usual ones"), sidebar item, dashboard tile.
  Designed first ("Web · expenses"). Not yet checked against real data: the tables go live
  with the push; pages load empty without them. Expense types in `packages/db` were added by
  hand until `pnpm db:types` can run.

- **2026-10-24** — Owner: the grid's totals only show after scrolling, too much for small
  screens. **Slice 11: attendance on small screens** — designed first (desktop grid artboard
  updated with pinned columns; new "Web · attendance on a phone (day view)"), then built: names
  and Days/Late/Absent pinned while days scroll; below `md` the sidebar folds into a top bar
  with a Menu button (`nav-shell.tsx`) and Attendance opens in a **Day view** (date switcher,
  chips, one row per person with month totals and minutes late, tap to select + Set to) with a
  Day | Month switch. Checked at 1000 px (both sides stay pinned while scrolling) and 375 px
  (no sideways scroll on any page; marked and cleared Test Staff from the Day view, DB back to
  the one 23/10 half day). Next: expenses.

- **2026-10-24** — Owner asked me to push: pushed slices 1–9 (`e1cbba7`), CI green.
  **Slice 10: dashboard** — designed first as "Web · dashboard" on the FinCrew key screens
  canvas (toggles: dark, salary state, all marked), then built: greeting, Mark today present,
  today's attendance (present / absent / late / not marked chips, not-marked and came-late lists
  with check-in time and minutes late), Due to staff and Advances tiles, this month's salary
  (steps, net / paid / still to pay, next action), Coming up (holidays and leaving dates in 30
  days, salary due at month end). Checked in the browser (data matches the live shop; 1280 and
  375 px wide); marked Test Staff present from the dashboard and cleared it again. Phase 4 done.

- **2026-10-24** — **Slice 9: payslip print, attendance CSV, clear a mark** — `/payslips/[id]`:
  printable payslip outside the shell (shop, month, employee, pay period, days, earnings,
  deductions, advance cut, net, paid so far / still to pay; Draft notice), "Print or save as
  PDF" via the browser, prints in the light theme even in dark mode; linked from each person's
  row on Salary. `/attendance/export?month=YYYY-MM`: CSV (UTF-8 BOM, DD/MM/YYYY day columns,
  payable / late / absent) behind `reports.export`, "Download CSV" on Attendance. Grid toolbar
  "Not marked" clears marks (delete, same date permissions). Checked in the browser: payslip
  numbers match the run (₹355 draft), CSV bytes and content, mark + clear today (DB back to the
  one 23/10 half day). Next: web dashboard.

- **2026-10-24** — **Slice 8: staff detail extras** — Overview: Details (name, phone, joining,
  leaving date → status left/active) and one-time Opening balance (confirm tick; ledger line).
  Pay tab: allowances/deductions with End today and two-step Remove, add forms; change leave
  template from a date; **Rules just for {name}** (per-person `pay_rules_override` /
  `late_policy_override` from a date). Changing pay now carries own rules into the new version.
  Checked in the browser on Test Staff and reverted every change (DB confirmed: 1 pay row, no
  overrides, no allowances, active, 0 ledger lines). Opening balance only tested for its error
  (a real one is permanent). Next: payslip print/PDF, attendance CSV, clear a mark.

- **2026-10-24** — **Slice 7: roles & permissions** — Settings → Roles: list (permission count,
  who has it), new role (name + permissions by area), role page (permissions, people, rename,
  two-step delete). Permission labels are i18n strings; new `@fincrew/i18n` test checks every
  `PERMISSIONS` key has one. Checked in the browser on the live shop with a test role (created,
  permissions changed, given to Test Staff, renamed, deleted; DB checked at each step and left with
  0 roles). Next: staff detail extras.

- **2026-10-24** — **Slice 6: settings** — Settings in the sidebar with Holidays (by year, add /
  replace / remove, paid or not), Leave templates (list with plain-words summary and head count;
  new template; template page with rules by date, change from a date, rename, archive, move staff
  from a date) and Pay & attendance rules (every `ShopRules` field). Also fixed every website form
  losing what was typed when a save was refused (React 19 form reset): forms now submit through
  `useFormAction`. Checked in the browser: holiday add/remove (test holidays removed again),
  form validation and conditional fields; no template created and rules not saved on the live shop.
  Next: roles & permissions.

- **2026-10-23** — **Slice 5: advances** (give/repaid with limit confirmation, advance rules, undo
  in ledger, Advances page). Test Staff now has limit ₹5,000 and cut ₹1,000 (still deletable: no
  ledger lines). Next: settings screens (holidays, leave templates + assignment, shop rules, roles).

- **2026-10-23** — **Slice 4: salary run** (work out, review with lines/days/warnings, finalize,
  pay). Checked with Test Staff as a draft (₹355). Not finalized on the live shop: ledger lines
  are permanent and would make Test Staff undeletable — owner to decide. Next: advances and
  undo payment, holidays + leave templates + rule settings screens, staff extras, payslip PDF.

- **2026-10-23** — **Slice 3: attendance grid** (month view, select days + Set to, Mark today
  present, paid-leave balance check, past-day permission). Checked with Test Staff (today is now
  a half day). Next: salary run (slice 4), then advances, holidays/leave-template/settings screens.

- **2026-10-23** — add_staff live; slice 1 checked in the browser (owner signed in) and a
  **Test Staff** added on the live shop (delete when not needed). **Slice 2**: staff detail
  (overview, ledger, pay + change pay from a date). Owner rule: **dates DD/MM/YYYY everywhere**
  (core format/parse; text date fields). Next: attendance grid (slice 3), then salary run,
  advances, settings screens, staff detail extras (template assignment, allowances, invite).

- **2026-10-23** — **Phase 4.3 slice 1**: web app shell (sidebar, shop switcher, permission-aware
  sections), staff list and Add staff (`add_staff` RPC, migration 5). Built and typechecked;
  needs push + owner sign-in to check in the browser. Next slices: staff detail, attendance grid,
  salary run, settings. See `docs/features/fincrew-web.md`.

- **2026-10-23** — Owner reviewed the key screens; their comment (Show QR instead of Copy code on
  Attendance code) applied to the FinCrew canvas and recorded in DECISIONS. Website restyle
  checked in the browser, light and dark: Anek loaded, token colours, 56px primary buttons.

- **2026-10-23** — Key screens published in Claude Design (FinCrew, Staffora; see DESIGN.md).
  `packages/ui` generated from design tokens (`pnpm ui:tokens`, CI check, 6 tests); website now
  uses tokens.css + Anek Latin. Not yet visually checked in the browser; owner hasn't reviewed
  the screen designs. Next: review screens, then Phase 4.3 screens (Today, staff, salary run).

- **2026-10-23** — Money migration live (CI run 39953812217): 21 tables, all RLS; advisors show only
  the accepted warnings (FK/initplan notes fixed); DB types regenerated.

- **2026-10-23** — Pushed: multi-shop + Phase 4.1 live (CI run 39950298454); live DB checked (4
  migrations, 16 tables all RLS, owner data intact), advisors rerun, DB types regenerated.
  **Phase 4.2** migration `20261023000004_money.sql`: advances, ledger_entries (append-only),
  salary_runs, payslips (revisions), leave_balances, ledger/advance balance views,
  finalize_payslip; advisor fixes folded in. 24 money tests (87 DB tests).
  `supabase/vitest.config.ts` raises hook timeout (each file boots its own PGlite).

- **2026-10-23** — **Phase 4.1** migration `20261023000003_staff_attendance.sql`: staff, pay
  settings, allowances, fixed deductions, leave templates + versions + assignments, holidays,
  attendance; composite FKs for shop safety; RLS per PLAN §3 incl. past-day edits; audit on all.
  21 new DB tests (63 total). Feature doc `docs/features/staff-attendance-data.md`.

- **2026-10-23** — **Multi-shop.** Migration `20261023000002_multi_shop.sql`: one `people` row per
  (shop, login), shop-scoped RLS helpers, `create_shop` (first run, or owners adding shops),
  `my_permissions(p_shop)`, write policies split, FK indexes. 14 multi-shop tests (42 DB tests).
  Website: current shop cookie, shop switcher, `/shops/new`. DB types hand-updated for the new
  functions until `pnpm db:types` after the push.

- **2026-10-23** — Owner asked for no hard-coded rules and support for staff with no leave. Added
  `settings.ts` (shop rules, defaults, per-staff overrides, validation); every Phase 2
  interpretation is now a setting (day-rate basis, off-day work, unmarked days, holiday vs
  weekly off, marks on off days, sandwich triggers/sides/applies-to, leave accrual, late count
  start, half-day threshold on/off, free-day use, fixed per-day late charge, lockout values,
  hourly hours per day). No-template staff supported. 201 core tests.

- **2026-10-23** — **Phase 2 done.** `packages/core`: exact fractions (`rational`), dates,
  effective-dated versions, leave templates + carry-over, attendance → payable days + sandwich
  rule, late policy, salary (monthly/daily/hourly, mid-month changes, overtime, allowances,
  leave payout, deductions, advance cut), ledger (reversals, re-run adjustments, advances),
  expenses, attendance-code rules. 154 core tests, written test-first. 13 interpretations
  recorded in DECISIONS for the owner.

- **2026-10-23** — Design system v1 created in Claude Design by a separate session
  ("FinCrew Design System", https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP); recorded in
  `docs/DESIGN.md`. Verified the artifact reads (README, index, 75 files).

- **2026-10-23** — FinCrew web deployed to Vercel and verified; owner signed in on the live site.
  **Phase 1 done.**

- **2026-10-23** — Hardening migration live; advisor rechecked; DB types regenerated (helpers no
  longer in `public`). Open items listed under "Next up".

- **2026-10-23** — Owner login + shop setup done against the live project and verified in the DB
  (`supabase db query --linked --project-ref …`). Security advisor run → hardening migration
  `20261023000001_harden_functions.sql` (not yet pushed). Live checks use the CLI login only.

- **2026-10-23** — Live DB verified from outside (schema via generated types, anonymous access
  refused via REST). Real DB types generated; `db-types.mjs` validates the ref.
- **2026-10-23** — Repo on GitHub; secrets set; first CI migrate run applied the foundation
  migration to the live project. (First run before secrets existed stopped safely at "Check
  secrets".)
- **2026-10-23** — Migrations auto-apply from GitHub Actions after CI passes; CI blocks edits to
  applied migrations; Supabase CLI moved to repo root (`db:login`, `db:types`); SETUP rewritten
  for the GitHub-first order.
- **2026-10-22** — Phase 1 scaffold: monorepo, foundation migration + RLS tests, web sign-in and
  shop setup, CI and keep-awake, docs.
