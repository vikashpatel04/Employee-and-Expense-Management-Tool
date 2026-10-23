# Core rules (`packages/core`)

PLAN §4 as code. Pure TypeScript (no Supabase/React), so the website, both apps, edge functions
and the database tests all use the same rules. 154 tests; each module has a `*.test.ts` beside it.

Status: **done** (Phase 2, 2026-10-23). Interpretations the plan didn't spell out are marked
**(interp.)** and listed together in `docs/DECISIONS.md` for the owner to confirm.

## Modules

| Module               | PLAN       | What it does                                                                              |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `money.ts`           | §4.1       | Paise type, `formatINR` (₹1,25,000.00), `roundToRupee` (half-up)                          |
| `rational.ts`        | §4.1       | Exact fractions on BigInt; `ratToRupeePaise` is the ONE rounding per payslip line         |
| `dates.ts`           | §4.1       | IST business dates `YYYY-MM-DD`, month ranges, weekday, `minutesOfDayIST`                 |
| `dated.ts`           | §4.2, §4.6 | `effectiveOn` / `segments`: which dated version applied on a day                          |
| `leave.ts`           | §4.2       | Template versions, assignments, monthly leave roll with carry-over modes                  |
| `attendance.ts`      | §4.3, §4.2 | Calendar (weekly offs, holidays), statuses → payable half-day units, sandwich rule        |
| `late.ts`            | §4.4       | Lateness per day, free late days, half-day threshold, early leaving, per-minute charge    |
| `salary.ts`          | §4.6       | `calculateSalary`: payslip lines, totals, warnings                                        |
| `ledger.ts`          | §4.7       | Balance, running balance, reversals, payslip → ledger lines, re-run adjustments, advances |
| `expenses.ts`        | §4.8       | Paid by / charged to, staff ledger effects, shop totals                                   |
| `attendance-code.ts` | §4.5       | Scanned code parsing, check-in/out decision, lockout, cooldown, next code change          |
| `permissions.ts`     | §3         | Permission keys (mirrored in the DB, checked by a test)                                   |

## Money and rounding

- Amounts are integer paise. Inside a calculation, values are exact fractions; each payslip line
  is rounded to the rupee, half-up, exactly once. Totals add the rounded lines.
- Example: ₹30,000 a month, pay rises to ₹36,000 on the 16th of a 31-day month:
  30,000 × 15/31 + 36,000 × 16/31 = ₹33,096.77 → **₹33,097** (one rounding, not two).

## Leave (§4.2)

- Template version: weekly offs (weekday + paid/unpaid), paid leaves per month, carry-over,
  sandwich rule. Staff → template by dated assignment; template → version by date.
- Monthly roll: `available = opening + earned`; `used` can't exceed it.
  - `lapse`: unused disappears. `carry` (optional cap): banked up to the cap.
  - `carry_within_year` / `payout`: `resetMonth` is the **last month of the leave year**; at its
    end the bank lapses / is paid out (payout goes on that month's payslip at its day rate). **(interp.)**
- Earned is the full monthly allotment in any month the person is employed, even a partial
  first month. **(interp.)**
- The carry-over decision uses the version in effect on the month's last employed day. **(interp.)**

## Attendance → payable days (§4.3, §4.6)

Pay is counted in half-day units: present 2, half day 1, paid leave 2, absent / unpaid leave 0.

- Weekly offs and holidays fill in automatically: paid → 2 units, unpaid → 0.
  A shop holiday on a weekly off counts as the holiday. **(interp.)**
- Working on a weekly off or holiday: the off day keeps its own pay **and**, with the "extra
  working day" setting on (default), the work is paid as an extra day (present 2 / half 1).
  So a paid Sunday worked = 2 days' pay; an unpaid one = 1. **(interp.)**
- Other marks on an off day (absent, leave) are treated as the off day itself. **(interp.)**
- A working day with no mark is **unmarked**: not paid, and the salary run warns. **(interp.)**
- Only days from joining to leaving count.
- **Sandwich rule** (off by default): a paid weekly off becomes unpaid when the nearest working
  day before AND after are both marked **absent**. It looks past other offs and holidays, across
  month edges, and stops at the employment edge. Unpaid leave, half days and unmarked days don't
  trigger it; nor does an off day the person worked. **(interp.: only `absent` counts)**

## Lateness (§4.4)

- Late minutes count from shift start once past grace (11 min late with 10 min grace = 11).
- `notice_only` (default): shown, never charged.
- `deduct`: first N late days free (default 3), later ones charged
  `minutes × day_rate ÷ shift_minutes`; more than the threshold (default 120 min) late turns the
  day into a half day instead. A half-day conversion doesn't use up a free day. **(interp.)**
- Early leaving (off by default) adds to the same day's minutes, count and threshold.
- Only `present` days with a check-in are measured; hourly staff and staff without a shift are
  never late. The month uses the staff override in effect on its last employed day. **(interp.)**

## Salary (§4.6)

`calculateSalary(input)` returns payslip `lines` (`earned`, `overtime`, `allowance`,
`leave_payout`, `deduction`, `late_deduction`, `advance_cut`; kinds + names, no display text),
totals (`gross`, `deductions`, `netBeforeAdvance`, `advanceCut`, `netPay`), the day breakdown,
late outcomes and warnings (`unmarked_days`, `no_pay_settings`, `missing_check_out`,
`negative_net_pay`).

- Each day uses the pay settings in effect that day, so mid-month changes split naturally.
- Monthly: `monthly ÷ D × payable days`. Daily: `wage × payable days`. Hourly: `rate × hours
between check-in and check-out` (missing check-out → warning, not paid).
- Overtime: `minutes × overtime rate ÷ 60` from each day's record.
- Allowances / fixed deductions **(interp.)**: share of the employed days they cover.
  Fixed: `amount × covered ÷ employed`. Prorated: `amount × payable days within its cover ÷
employed`, never more than the fixed share. A full-month, fully-attended person gets the full
  amount; so does a mid-month joiner who attended every day.
- Leave payout: days × day rate from the settings on the last employed day (hourly: rate × shift
  length). **(interp.)**
- Advance cut: `min(scheduled cut, outstanding, net before advance)`, never below zero.

## Ledger (§4.7)

- Positive = the shop owes the staff member. Balance = sum of lines, never stored.
- Lines are never edited: `reversalOf` undoes one (once; a reversal can't be reversed).
  Re-running a finalized month writes `adjustment` lines for the differences only.
- A finalized payslip posts `salary_earned` (+gross), each `deduction` and `late_deduction`
  (negative). The **advance cut is not a ledger line**: the advance was posted as a negative line
  when given, and paying a smaller salary recovers it. Advance −10,000; salary +30,000; paid
  26,000 (4,000 cut) → balance −6,000, exactly the uncut advance. **(interp.: plan listed
  `advance_cut` as a ledger type; it stays in the enum but money-wise lives on the payslip)**
- Advances: outstanding = given − cut − repaid; crossing the per-person limit returns
  `crossesLimit` for the app to confirm.

## Expenses (§4.8)

- Charged to staff → `staff_charge` (negative) on their ledger. Paid by staff + reimburse →
  `reimbursement` (positive) on the payer's ledger. Both can apply.
- Below the small-expense limit, "charged to" defaults to Not tracked.
- Shop totals count only shop-charged expenses; not-tracked and staff-charged are reported apart.

## Attendance code (§4.5)

- Scanner accepts any QR whose content is exactly 6 digits.
- Order of checks: lockout (5 wrong codes within 10 min → 10 min wait from the 5th) → wrong code →
  cooldown after an accepted check (2 min) → check-in, or check-out after the minimum gap
  (30 min) → refuse after check-out. Attempts during lockout don't count as wrong. **(interp.)**
- Daily rotation at a chosen IST time (default midnight), or manual only.
- Not here (server side, Phase 7): code hashing and storage, device binding.
