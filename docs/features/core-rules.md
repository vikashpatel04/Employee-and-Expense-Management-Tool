# Core rules (`packages/core`)

PLAN §4 as code. Pure TypeScript (no Supabase/React), so the website, both apps, edge functions
and the database tests all use the same rules. 201 tests; each module has a `*.test.ts` beside it.

Status: **done** (Phase 2, 2026-10-23). **No business rule is hard-coded:** every choice is a
setting the owner (admin) can change, shop-wide or per staff member. The defaults below are what
the shop gets until someone changes them.

## Settings reference

Stored per shop in `shops.settings` (read with `resolveShopRules`, checked with
`validateShopRules`). A staff member's pay settings can override any `pay` or `late` field for
that person (`payRulesOverride`, `latePolicyOverride`). Leave settings live on each **leave
template version**, so different staff can have different leave rules.

### Pay rules (`settings.ts`, `PayRules`)

| Setting              | Options                           | Default         | What it does                                                                                                                                                |
| -------------------- | --------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dayRateBasis`       | `calendar_days` · `fixed_days: N` | `calendar_days` | Monthly salary ÷ days in this month, or ÷ a fixed N (e.g. 30, 26). A fully paid month always pays exactly the salary; each unpaid day costs salary ÷ basis. |
| `offDayWork`         | `extra` · `replace` · `none`      | `extra`         | Working a weekly off/holiday: off-day pay + an extra day; paid once as a working day; or only the off day's own pay.                                        |
| `unmarkedDay`        | `unpaid` · `paid`                 | `unpaid`        | A working day nobody marked. The salary run warns either way.                                                                                               |
| `holidayOnWeeklyOff` | `holiday` · `weekly_off`          | `holiday`       | Which paid flag decides a holiday that falls on a weekly off.                                                                                               |
| `markOnOffDay`       | `ignore` · `apply`                | `ignore`        | Absent/leave marked on an off day: the off day stands, or the mark replaces it (paid leave then uses balance).                                              |

### Late policy (`late.ts`, `LatePolicy`)

| Setting                   | Options                                                     | Default                                                |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `mode`                    | `notice_only` · `deduct`                                    | `notice_only`                                          |
| `freeLateDays`            | 0 or more                                                   | 3                                                      |
| `halfDayThresholdMinutes` | minutes, or `null` (never)                                  | 120 (more than this → half day)                        |
| `halfDayUsesFreeDay`      | yes / no                                                    | no                                                     |
| `earlyLeaving`            | yes / no                                                    | no (when on: same count, threshold and charge as late) |
| `lateCountsFrom`          | `shift_start` · `grace_end`                                 | `shift_start`                                          |
| `charge`                  | `per_minute` (day rate ÷ shift minutes) · `per_late_day: ₹` | `per_minute`                                           |

Per staff member (pay settings): shift start/end, grace minutes (default 10), and any of the above.

### Leave template version (`leave.ts`)

| Setting              | Options                                                                                       | Default for a new template |
| -------------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| `weeklyOffs`         | any weekdays, each paid/unpaid; empty = none                                                  | —                          |
| `paidLeavesPerMonth` | 0 or more (0 = no paid leave)                                                                 | —                          |
| `carryOver`          | `lapse` · `carry` (optional cap) · `carry_within_year` (reset month) · `payout` (reset month) | `lapse`                    |
| `accrual`            | `full` · `prorated` (rounding `down`/`nearest`/`up`)                                          | `full`                     |
| `sandwich.enabled`   | yes / no                                                                                      | no                         |
| `sandwich.triggers`  | any of `absent`, `unpaid_leave`, `half_day`, `unmarked`                                       | `absent`                   |
| `sandwich.appliesTo` | `weekly_off`, `holiday`                                                                       | `weekly_off`               |
| `sandwich.sides`     | `both` · `either`                                                                             | `both`                     |

`resetMonth` is the **last** month of the leave year (3 = year ends with March).

**Staff with no leave:** don't assign a template (no weekly offs, no paid leave, any bank
lapses, paid leave can't be marked), or assign one with `paidLeavesPerMonth: 0` and/or no
weekly offs.

### Attendance code (`attendance-code.ts`, `CodeSettings`)

| Setting                                                       | Default                                       |
| ------------------------------------------------------------- | --------------------------------------------- |
| `rotation`                                                    | daily at 00:00 IST (`atMinutes`), or `manual` |
| `minGapMinutes` (check-in → check-out)                        | 30                                            |
| `cooldownMinutes` (after any accepted check)                  | 2                                             |
| `checkOutRequired`                                            | yes                                           |
| `maxWrongCodes` / `wrongCodeWindowMinutes` / `lockoutMinutes` | 5 / 10 / 10                                   |

### Other

| Setting                                                                 | Where               | Default                                        |
| ----------------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `smallExpenseLimit`                                                     | shop                | none (amounts below it default to Not tracked) |
| Advance limit                                                           | per staff member    | none                                           |
| Pay type, salary/wage/rate, overtime rate, `hoursPerDay` (hourly)       | pay settings, dated | —                                              |
| Allowances / fixed deductions: amount, fixed or prorated, from/to dates | per staff member    | —                                              |
| Holidays: date, paid or not                                             | shop                | —                                              |

### Fixed by design (not settings)

- Money is integer paise; each payslip line is rounded to the rupee, half-up, once (PLAN §4.1).
- Business dates are Asia/Kolkata; IST has no daylight saving.
- Ledger lines are never edited or deleted (PLAN §4.7). The advance cut is a payslip line, not a
  ledger line, because the advance is already on the ledger (see Ledger below).
- The advance cut never takes net pay below zero (PLAN §4.6).

## Modules

| Module               | PLAN       | What it does                                                                        |
| -------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `settings.ts`        | all        | Shop rule set, defaults, overrides, validation                                      |
| `money.ts`           | §4.1       | Paise type, `formatINR` (₹1,25,000.00), `roundToRupee` (half-up)                    |
| `rational.ts`        | §4.1       | Exact fractions on BigInt; `ratToRupeePaise` is the one rounding per line           |
| `dates.ts`           | §4.1       | IST business dates `YYYY-MM-DD`, month ranges, weekday, `minutesOfDayIST`           |
| `dated.ts`           | §4.2, §4.6 | `effectiveOn` / `segments`: which dated version applied on a day                    |
| `leave.ts`           | §4.2       | Template versions, assignments, accrual, monthly roll with carry-over               |
| `attendance.ts`      | §4.3, §4.2 | Calendar, statuses → payable half-day units, sandwich rule                          |
| `late.ts`            | §4.4       | Lateness per day, free days, half-day threshold, charges                            |
| `salary.ts`          | §4.6       | `calculateSalary`: payslip lines, totals, warnings                                  |
| `ledger.ts`          | §4.7       | Balance, running balance, reversals, payslip → ledger, re-run adjustments, advances |
| `expenses.ts`        | §4.8       | Paid by / charged to, staff ledger effects, shop totals                             |
| `attendance-code.ts` | §4.5       | Scanned code, check-in/out decision, lockout, cooldown, rotation                    |
| `permissions.ts`     | §3         | Permission keys (mirrored in the DB, checked by a test)                             |

## How the calculations work

### Attendance → payable days

Pay is counted in half-day units: present 2, half day 1, paid leave 2, absent / unpaid leave 0.
Weekly offs and holidays fill in automatically (paid 2, unpaid 0). Only days from joining to
leaving count. The sandwich rule looks for the nearest working day on each side, past other off
days, across month edges, stopping at the employment edge.

### Salary

`calculateSalary(input)` returns payslip `lines` (`earned`, `overtime`, `allowance`,
`leave_payout`, `deduction`, `late_deduction`, `advance_cut`; kinds and names, no display text),
totals (`gross`, `deductions`, `netBeforeAdvance`, `advanceCut`, `netPay`), the day breakdown,
late outcomes and warnings (`unmarked_days`, `no_pay_settings`, `missing_check_out`,
`negative_net_pay`).

- Each day uses the pay settings in effect that day, so a mid-month change splits the month.
  ₹30,000 rising to ₹36,000 on the 16th of a 31-day month: 30,000 × 15/31 + 36,000 × 16/31 =
  ₹33,096.77 → **₹33,097** (one rounding).
- Monthly: each day adds salary ÷ D, plus (day's units ÷ 2 − 1) × salary ÷ basis. With the
  calendar basis that is simply salary × payable days ÷ D.
- Daily: wage × payable days. Hourly: rate × hours between check-in and check-out (missing
  check-out → warning, not paid).
- Overtime: minutes × overtime rate ÷ 60.
- Allowances / fixed deductions: the share of employed days they cover. Fixed:
  `amount × covered ÷ employed`. Prorated: by payable days within that, never more than the
  fixed share.
- Leave payout: days × day rate (hourly: rate × `hoursPerDay`, or the shift length).
- The month uses the staff overrides in effect on its last day of employment.

### Ledger

Positive = the shop owes the staff member. Balance = sum of lines, never stored. `reversalOf`
undoes a line once; re-running a finalized month writes `adjustment` lines for the differences.
A finalized payslip posts `salary_earned` (+gross), each `deduction` and `late_deduction`
(negative). Advance −10,000; salary +30,000; paid 26,000 (4,000 cut) → balance −6,000, exactly
the uncut advance. Advances: outstanding = given − cut − repaid; crossing the person's limit
returns `crossesLimit` for the app to confirm.

### Expenses

Charged to staff → `staff_charge` (negative) on their ledger. Paid by staff + reimburse →
`reimbursement` (positive) on the payer's ledger. Shop totals count only shop-charged expenses.

### Attendance code

Order of checks: lockout → wrong code → cooldown → check-in, or check-out after the minimum gap
→ refuse after check-out. Attempts while locked don't count as wrong. Hashing, storage and device
binding are server side (Phase 7).
