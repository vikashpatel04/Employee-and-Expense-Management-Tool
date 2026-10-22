# FinCrew + Staffora: plan

Staff, salary and expense management for my shop. Open source (MIT).
I host it myself and only my shop uses it. There's no paid or hosted version.
Anyone can fork it and run their own copy. (Successor to StaffBook.)

- **FinCrew**: the management app. Website + Android. For the owner and anyone given access.
- **Staffora**: the staff app. Android. Each staff member sees their own records and marks their own attendance (if allowed).

This document is the brief for building it. Section 9 lists working rules for the build.

---

## 1. Decisions

- Android first; iPhone maybe later.
- Staff log in with an invite link and a 4-digit PIN. No SMS costs.
- Monthly salary by default. **Per-day rate = monthly salary ÷ actual days in that month.**
- Weekly offs and leave rules come from **leave templates**, assigned per staff with a start date.
- **Custom roles with permissions.** The owner is always all-powerful.
- **Self attendance by an attendance code.** The system gives a 6-digit code; I make my own QR from it for my shop display. Staff scan that QR or type the code in Staffora. Code schedule and cooldowns are adjustable. Self attendance is switched on or off per staff. When off, the owner or a permitted user marks attendance.
- **Late arrival:** a setting chooses notice-only or deduction (method in section 4.4).
- Every staff member has a **ledger** (running account) with an opening balance.
- Expenses record **paid by** and **charged to**, with a "Not tracked" option for small amounts.
- Free tiers only. The one cost is the Play Store fee ($25, once), and only if published there; otherwise install the APK directly.
- **Premium UI and UX is a requirement.** Design happens in its own phase, using the design tool, before screens are built (section 7).

---

## 2. Stack

| Piece | What it does here |
|---|---|
| **Turborepo + pnpm** | One repository; all apps and shared packages build together. |
| **Next.js** on **Vercel** | FinCrew website. Auto-deploys on push. |
| **Expo** (React Native) + EAS | FinCrew Android and Staffora Android. Development builds (not Expo Go) because of widgets. |
| **Supabase** | Postgres, auth, storage (photos, documents), edge functions, scheduled jobs. |
| **Row-level security (RLS)** | Every permission is enforced in the database. |
| **TanStack Query** | Caching, instant screens, weak-network tolerance. |
| **Zod** | Shared validation. |
| **Expo Push** | Notifications. |
| **expo-camera** | QR scanning, bill photos. |
| **react-native-android-widget** | Home-screen widgets (FinCrew). |
| **i18next** | Translations later (Tamil/Hindi). English first, but no hard-coded strings. |
| **Vitest** | Tests for `packages/core` and RLS policies. |

### Repository layout

```
apps/fincrew-web       Next.js (FinCrew website)
apps/fincrew-mobile    Expo (FinCrew Android)
apps/staffora-mobile   Expo (Staffora Android)
packages/core          pure logic: salary, leave, late rules, ledger, money/date helpers
packages/db            generated database types + shared queries
packages/ui            design tokens + shared components (native and web variants)
packages/i18n          translation files
supabase/              migrations, RLS policies, edge functions, seed data
```

Shared packages hold the logic and the look. Each app keeps its own screens.

---

## 3. Roles and permissions

- **Owner:** everything, always. Cannot be removed or locked out.
- **Custom roles:** the owner creates roles (e.g. "Supervisor") and ticks permissions.
- **Staff:** built-in; sees only their own records in Staffora.
- A person can be both staff and hold a custom role (e.g. a senior staff who marks attendance).

| Area | Permissions |
|---|---|
| Staff | view list · add/edit · view pay settings · edit pay settings |
| Attendance | mark for others · edit past days · view/regenerate attendance code |
| Leave & advance requests | approve/reject |
| Advances | give |
| Salary | view · run and pay · undo payment |
| Expenses | add · view all · edit/delete · manage categories |
| Reports | view · export |
| Settings | leave templates · attendance & late rules · roles · shop settings |

Permissions are stored as rows (`role_permissions`) and checked by an SQL helper `has_permission(key)` used in every RLS policy.

---

## 4. Rules

### 4.1 Money and dates
- All money is stored as **integer paise**. Display in Indian grouping (₹1,25,000.00).
- Rounding happens only once per payslip line, to the rupee, half-up.
- Business dates are calendar dates in **Asia/Kolkata**. Times are stored as timestamptz.

### 4.2 Leave templates
A template defines:
- **Weekly off days**: any weekdays (e.g. Sunday; or Tuesday; or none). Each off day is marked **paid or unpaid**.
- **Paid leaves**: number per month (0 or more).
- **Carry-over** of unused paid leaves, one of:
  - lapse at month end (default)
  - carry over, with an optional cap (e.g. max 6 banked)
  - carry over within the year, lapse on a chosen reset month
  - pay out unused leaves at reset (at the day rate of that month)
- **Sandwich rule** (optional, off by default): if someone is absent on both the working day before and the working day after a paid weekly off, that off day becomes unpaid.

Templates and assignments are **dated**:
- Assigning a template to a staff member takes an effective-from date.
- Editing a template creates a new version from a chosen date.
- Old months always recalculate with the version that applied then.

### 4.3 Attendance statuses
`present` · `half_day` · `absent` · `paid_leave` · `unpaid_leave` · `weekly_off` · `holiday`

- Weekly offs and shop holidays fill in automatically.
- A staff member can still be marked present on a weekly off or holiday. That day is paid as **extra working day** at the day rate (setting: on/off, default on).
- Marking `paid_leave` uses the leave balance. With no balance left, it's refused (the user can mark `unpaid_leave` instead).
- Shop holidays are set once for everyone, each marked paid or unpaid.

### 4.4 Shift timing and lateness
Optional per staff: shift start, shift end, grace minutes (default 10).

Shop-level **late policy** (with per-staff override):
- **Mode:** `notice_only` (default) or `deduct`.
- In `notice_only`, lateness is shown on records and in reports; no money changes.
- In `deduct`:
  - **Free late days:** the first N late days in a month aren't charged (default 3).
  - After that, each late day is charged **late minutes × per-minute rate**, where per-minute rate = day rate ÷ shift minutes. Late minutes are counted from shift start, not from the end of grace.
  - **Half-day threshold:** arriving more than X minutes late (default 120) turns the day into a half day instead of a minute deduction.
  - **Early leaving** follows the same rules if enabled (default off).
- Late deductions appear as their own payslip line and ledger line.

### 4.5 Self attendance (attendance code)
- The system generates a **6-digit attendance code**. That's all it provides; it doesn't drive any display.
- The owner (or a permitted user) sees today's code in FinCrew with a **copy** button, and can **regenerate** it at any time.
- I make my own QR from the code and show it on my shop display however I like.
- In Staffora, staff either **scan a QR** or **type the code**. The scanner accepts any QR whose content is the plain 6-digit code, so any QR generator works.
- **Settings** (adjustable):
  - code changes: daily at a chosen time (default 00:00), or only when regenerated manually
  - minimum gap between check-in and check-out (default 30 min)
  - cooldown after any check-in/out before another is accepted (default 2 min, prevents double taps)
  - whether check-out is required
- Codes are stored hashed with their valid-from time; only the current code is accepted.
- Each staff account is **bound to one phone** on first login. Changing phones needs the owner to reset it.
- 5 wrong codes in 10 minutes → 10-minute wait.
- Every attempt stores time, device id, method (scan/typed) and result. Manual marks by others store who marked it.

### 4.6 Salary calculation
For a staff member and a month with D days:

```
day_rate            = monthly_salary / D
payable_days        = present + 0.5 × half_day + paid_leave
                    + paid weekly_off + paid holiday + extra working days
                    (only days between joining date and leaving date count)
earned              = day_rate × payable_days
overtime            = overtime_hours × overtime_rate
allowances          = each allowance, either fixed or prorated (payable_days / eligible_days)
deductions          = fixed deductions + late deductions
gross               = earned + overtime + allowances + leave payout
net_before_advance  = gross − deductions
advance_cut         = scheduled cut, capped at net_before_advance (never negative)
net_pay             = net_before_advance − advance_cut
```

- **Daily-wage** staff: earned = daily wage × payable working days (weekly offs paid only if the template says so).
- **Hourly** staff: earned = hours worked × hourly rate.
- Pay settings are dated like templates; a mid-month change splits the month at the change date.
- A salary run creates a **draft**, then is **finalized**. Finalizing writes ledger lines. Editing attendance for a finalized month warns and requires re-running the salary (which writes adjusting lines, never edits old ones).

### 4.7 Staff ledger
Every money event for a staff member is one ledger line. Positive = shop owes the staff member.

Line types: `opening_balance`, `salary_earned`, `salary_payment`, `advance`, `advance_cut`, `late_deduction`, `deduction`, `reimbursement`, `staff_charge`, `adjustment`, `reversal`.

- Balance = sum of lines. Never stored separately.
- Lines are never edited or deleted; mistakes are fixed with a `reversal` line (this is how "undo payment" works).
- Advance limit per person; crossing it triggers an alert and needs confirmation.

### 4.8 Expenses
Each expense: amount, date, category, payment mode (cash/UPI/bank/card), note, bill photo (compressed to ~200 KB before upload), **paid by**, **charged to**.

- **Paid by:** owner, shop cash, or a staff member.
- **Charged to:**
  - **Shop**: normal shop expense; counts in totals.
  - **Staff member**: adds a `staff_charge` line to their ledger (e.g. a personal purchase to recover).
  - **Not tracked**: kept for the record, excluded from all totals.
- If paid by a staff member from their own pocket and marked **reimburse**, a `reimbursement` line is added to their ledger.
- Setting: amounts below a chosen limit (e.g. ₹10) default to Not tracked.
- Categories are user-defined, with icon and colour.

---

## 5. Data model (starting point)

```
shops                  id, name, settings (jsonb: late policy, attendance code settings, small-expense limit, ...)
people                 id, shop_id, auth_user_id, name, phone, photo_path, is_owner
staff                  person_id, joining_date, leaving_date, self_attendance, device_id, status
staff_documents        id, staff_id, kind, file_path
roles                  id, shop_id, name
role_permissions       role_id, permission_key
person_roles           person_id, role_id
pay_settings           id, staff_id, effective_from, pay_type, monthly_salary, daily_wage,
                       hourly_rate, overtime_rate, shift_start, shift_end, grace_minutes,
                       late_policy_override (jsonb)
allowances             id, staff_id, effective_from, effective_to, name, amount, prorated
fixed_deductions       id, staff_id, effective_from, effective_to, name, amount
leave_templates        id, shop_id, name
leave_template_versions id, template_id, effective_from, weekly_offs (jsonb), paid_leaves_per_month,
                       carry_over (jsonb), sandwich_rule
staff_leave_templates  staff_id, template_id, effective_from
holidays               id, shop_id, date, name, paid
attendance             staff_id, date, status, check_in, check_out, late_minutes, overtime_hours,
                       source (self|manual), marked_by, note
attendance_codes       id, shop_id, code_hash, valid_from, created_by
attendance_scans       id, staff_id, at, device_id, kind (in|out), method (scan|typed), accepted, reason
leave_balances         staff_id, month, opening, earned, used, carried, paid_out
requests               id, staff_id, kind (leave|advance), from_date, to_date, amount, note,
                       status, decided_by, decided_at
advances               id, staff_id, date, amount, note, cut_plan (jsonb)
salary_runs            id, shop_id, month, status (draft|finalized), created_by
payslips               id, run_id, staff_id, lines (jsonb), net_pay, pdf_path
ledger_entries         id, staff_id, date, type, amount_paise, ref_table, ref_id, note, created_by
expense_categories     id, shop_id, name, icon, colour, archived
expenses               id, shop_id, date, amount_paise, category_id, payment_mode, note,
                       bill_path, paid_by_person_id, paid_by_kind, charged_to_kind,
                       charged_to_staff_id, reimburse, created_by
invites                id, person_id, token_hash, expires_at, used_at
pin_credentials        person_id, pin_hash, failed_attempts, locked_until
push_tokens            person_id, app, token
audit_log              id, shop_id, actor_id, table_name, row_id, action, before, after, at
```

`shop_id` is on every table so the code stays fork-friendly, even though only one shop exists.

---

## 6. Screens

### 6.1 FinCrew Android (owner and permitted users)
Bottom tabs: **Today · Staff · Money · More**

- **Today** (home)
  - date switcher, summary chips (present / absent / late / not marked)
  - staff list, one row per person: photo, name, status pill, check-in time, late badge
  - tap a row → status sheet (Present, Half day, Absent, Paid leave, Unpaid leave), times, overtime, note
  - "Mark all present" for unmarked rows
  - top-right: **Attendance code** (if permitted)
  - pending requests banner → request list (approve / reject)
- **Staff**
  - search, filter (active / left)
  - staff detail with tabs: **Overview** (balance, this month's days, quick actions: give advance, pay, call, WhatsApp) · **Attendance** (month calendar) · **Ledger** (lines, running balance) · **Pay** (pay settings, template, allowances; history by date) · **Documents**
  - add / edit staff (stepper: details → pay → leave template → shift → invite)
- **Money**
  - segment: **Expenses · Salary · Advances**
  - Expenses: month total by category, list, add expense (big amount field first, then category grid, paid by, charged to, photo)
  - Salary: month picker, run salary → draft review (per-person net, expandable lines) → finalize → pay all / pay one (mode) → share payslips on WhatsApp
  - Advances: outstanding by person, give advance
- **More**: reports, leave templates, holidays, roles & permissions, attendance & late settings, attendance code settings, expense categories, backup/export, import from StaffBook, profile
- **Attendance code screen**: today's code in large digits, copy button, regenerate, when it next changes, live list of today's check-ins
- **Widgets**: Today (present/absent/late), This month (salary paid + expenses)

### 6.2 FinCrew website
Same areas with more room:
- dashboard (today, month cost, pending requests, recent activity)
- attendance grid: all staff × days of the month, click a cell to edit, bulk edit
- salary run as a wide review table, printing payslips
- reports with charts, Excel/CSV export
- all settings screens
- audit log viewer

### 6.3 Staffora (staff)
Bottom tabs: **Home · Attendance · Money · Me**

- **First run:** open invite link → confirm name/phone → set PIN twice → phone bound
- **Home**
  - check in / check out with two big options: **Scan QR** and **Enter code** (6-digit pad), shown if self attendance is on. Success shows a clear confirmation with time and any late minutes.
  - today's status and times
  - this month at a glance: days present, leaves left, late count
  - latest payslip card
- **Attendance:** month calendar with status colours; tap a day for times and notes
- **Money:** account balance, ledger lines, payslips (open PDF, share), advance balance
- **Requests** (from Home or Money): request leave (dates, note), request advance (amount, note), status of past requests
- **Me:** profile, change PIN, language, log out
- **PIN screen** on every app open (biometric unlock as an optional convenience after PIN is set)

### 6.4 Notifications
- FinCrew: "Attendance not marked yet" (time set in settings), "Salary due" (month end), "Advance limit crossed", "New leave/advance request" (approve/reject actions on the notification).
- Staffora: "Payslip ready", "Request approved/rejected", optional "You haven't checked in" reminder.

---

## 7. Design

Design is done in the design tool before screens are built, then turned into `packages/ui`.

Brief:
- **Premium, calm, fast.** It should feel like a well-made banking app, not an admin panel.
- **One-handed use** on the shop floor: primary actions in thumb reach, large tap targets, no tiny icons without labels.
- **Numbers are the hero:** large, tabular figures for money; ₹ with Indian grouping; colour used for meaning (owed / paid / late), never decoration alone.
- **Status at a glance:** one consistent colour + icon per attendance status, used everywhere (pills, calendar, widgets).
- **Light and dark themes** from the start.
- FinCrew and Staffora share one design system but each has its own accent colour and icon, so staff never confuse them.
- Text must fit when translated to Tamil/Hindi (longer words, different scripts).
- Deliverables: design tokens (colour, type, spacing, radius, elevation), component set, key screens for both apps (Today, Attendance code, Staff detail, Salary run, Add expense, Staffora Home, Scan and Enter code), app icons for FinCrew and Staffora.

---

## 8. Build order

Each phase ends with something usable.

1. **Foundation:** monorepo, CI, Supabase project and migrations, RLS helpers and permission model, owner login, FinCrew website deploy, keep-awake ping (GitHub Actions).
2. **Core logic:** `packages/core` with tests for every rule in section 4 (salary, leave templates and carry-over, sandwich rule, late policy, ledger, money rounding). No UI yet.
3. **Design:** design tool pass per section 7, then `packages/ui`.
4. **FinCrew web core:** staff, roles, leave templates, holidays, manual attendance, advances, ledger, salary runs, payslips.
5. **FinCrew Android:** Today screen, staff, money, attendance code screen, push notifications.
6. **Expenses:** categories, paid by / charged to, bill photos, reports.
7. **Staffora:** invite + PIN edge functions, device binding, check-in/out by scanning or typing the code, own records, requests.
8. **Polish:** widgets, translations, offline attendance marking (queue and sync), import from old StaffBook (SQLite), backup/export.

---

## 9. Working rules for the build

- `packages/core` is pure TypeScript with no Supabase or React imports. Write the tests first from section 4.
- All schema changes go through Supabase migrations in `supabase/migrations`. Never edit the database by hand.
- Every table has RLS on. Write tests that log in as owner, a custom role and a staff member and check what each can read and write.
- Ledger lines and audit log rows are append-only (enforced in the database, not just the app).
- Money is integer paise end to end. No floats for money anywhere.
- Strings go through i18next from day one.
- Keep secrets (service role key) in edge function secrets, never in app code.

---

## 10. Things to know

- **Free Supabase project pauses after 7 days without use.** The scheduled ping in phase 1 prevents it.
- **Free tier limits:** 500 MB database, 1 GB storage. Fine for years with compressed photos.
- **Invite + PIN** isn't built into Supabase. Edge function verifies the PIN hash, locks for 15 min after 5 wrong tries and fully after 10 (owner unlocks), then signs in a normal Supabase user whose password only the server knows, so RLS works on `auth.uid()`. Invite links are single-use and expire after 48 hours. A forgotten PIN is reset by the owner sending a new invite.
- **Self-hosting later:** Supabase runs on Docker if I ever leave the cloud.
