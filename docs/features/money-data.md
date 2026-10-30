# Advances, ledger, salary runs and payslips

Phase 4.2 database layer. Migration `supabase/migrations/20261023000004_money.sql`, tests
`supabase/tests/money.test.ts` (one month of money walked end to end). Screens come in 4.3.

Status: **schema + rules done, not yet live** (applies on the next push; then `pnpm db:types`).

## How a month's money flows

1. **Advances** are rows in `advances` (`kind` given / repaid). Each row posts its own ledger line
   (`advance`, negative when given, positive when repaid in cash). Giving past the person's
   `advance_limit_paise` is refused unless `over_limit_confirmed` is set (the app asks first).
2. **Salary run:** `salary_runs` has one row per shop per month. The app calculates each payslip
   with `packages/core` (`calculateSalary`, `rollLeaveMonth`) and saves it as a **draft** in
   `payslips`: lines, day summary, warnings, leave month, totals. The database checks
   `net_before_advance = gross − deductions` and `net_pay = net_before_advance − advance_cut`.
3. **Finalize:** `finalize_payslip(id)` (needs `salary.run`) makes the payslip final and posts to the
   ledger **from the payslip**: `salary_earned` (+gross), each `deduction`, `late_deduction`. It
   also saves the leave month into `leave_balances`. The advance cut is not posted (the advance is
   already on the ledger; paying less recovers it). A finalized payslip can't change or be
   deleted; staff can see it from now on.
4. **Pay:** a `salary_payment` ledger line (negative, with `payment_mode`, `ref` = the payslip).
   The payslip must be final, and total payments can't exceed its net pay.
5. **Undo payment:** a `reversal` line with `reverses_id` (needs `salary.undo_payment`): exact
   opposite amount, once per line, never a reversal of a reversal. The payslip can then be paid
   again.
6. **Re-run after an attendance fix:** insert a new payslip for the same run and person; it becomes
   revision 2 (only after the previous one is final, one draft at a time). Finalizing it posts
   only the **differences** as `adjustment` lines (`adjusts` = the line type), dated today.

**Advance and expense settling (2026-10-29, `20261029000001_advance_mode_expense_dues.sql`)**:
each person's Advance rules (staff Pay / Overview) say how the salary run cuts their advance —
all of it (default), a fixed amount a month with the rest carried, or none — and whether
expenses they paid for the shop are paid back with the salary and expenses charged to them are
cut from it. Like the advance cut, the pay-back and the expense cut are payslip amounts, not
ledger lines: the reimbursement / charge is already on the ledger and paying net pay settles
it. A re-run of a finalized month adds back what that payslip had settled
(`salary-month.ts` `settledThisMonth`). Tests: `supabase/tests/expense-dues.test.ts` (12).

**Pay back now (2026-10-29, `20261029000002_reimbursement_paid.sql`)**: a `reimbursement_paid`
ledger line (negative, with payment mode) pays a staff member back for expenses before the
salary ("paid ₹30 for snacks, give it back tomorrow"). Needs `salary.run`; the trigger refuses
more than `expense_dues` says the shop owes; undo is a reversal (`salary.undo_payment`), shown
with Undo on the ledger. `expense_dues` subtracts these lines, so the salary won't pay it again.
Data: `payBackExpenses`, `loadExpenseOwed` (`packages/data/src/advances.ts`). Screens: staff
Overview "Expenses to pay back" + **Pay back now** (website dialog, app sheet
`components/payback-sheet.tsx`) and on an expense paid by staff (website expense panel, app
expense screen; amount starts at that expense, capped at what's owed).

Example from the tests: advances −₹9,000 + ₹1,000 repaid = −₹8,000; October finalized
(+₹30,000 − ₹1,800 PF − ₹44 late) → ₹20,156; paid ₹26,156 (₹2,000 cut) → **−₹6,000**, exactly
the advance still owed.

## Tables and views

| Object                                                 | Holds                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advances`                                             | given / repaid, amount, mode, note, over-limit confirmation, who; append-only                                                                                       |
| `ledger_entries`                                       | every money event per person (PLAN §4.7 types); append-only; sign checked per type                                                                                  |
| `salary_runs`                                          | one per shop per month                                                                                                                                              |
| `payslips`                                             | per person per run per revision: core's lines (jsonb), summary, warnings, leave, totals, PDF path, status                                                           |
| `leave_balances`                                       | per person per month: opening, earned, used, carried, paid out, lapsed                                                                                              |
| `ledger_balances` (view)                               | balance per person = sum of lines                                                                                                                                   |
| `advance_balances` (view)                              | outstanding advance = given − repaid − cuts on final payslips (latest revision), limit, monthly cut                                                                 |
| `staff.advance_cut_paise`                              | the person's monthly advance cut, used when the mode is `fixed`                                                                                                     |
| `staff.advance_cut_mode`                               | `all` (default: cut everything outstanding) · `fixed` (the monthly cut; the rest carries) · `none`                                                                  |
| `staff.expense_payback` / `expense_recover`            | settle expenses in salary: pay back what the shop owes / cut charges (both on by default)                                                                           |
| `expense_balances` (view)                              | per person: `payback_paise` (reimbursements not reversed − paid back by final payslips) and `charge_paise` (charges − cut by final payslips), with the two switches |
| `payslips.expense_payback_paise` / `expense_cut_paise` | expenses settled by this payslip; net pay = net before advance + pay-back − advance cut − expense cut (check `payslips_net_pay_check`)                              |

Views run with the caller's rights, so the same access rules apply.

## Who can do what

| Action                                                            | Needs                                    |
| ----------------------------------------------------------------- | ---------------------------------------- |
| See own ledger, balance, advances, final payslips, leave balances | being that person                        |
| See everyone's ledger, payslips (drafts too), runs                | `salary.view`                            |
| Create runs, write drafts, finalize, pay, adjust                  | `salary.run`                             |
| Undo a payment (any reversal)                                     | `salary.undo_payment`                    |
| Give / record repaid advances                                     | `advances.give`                          |
| Opening balance (once per person)                                 | `staff.pay.edit`                         |
| Write `salary_earned` / `deduction` / `late_deduction` lines      | nobody directly: only `finalize_payslip` |
| `staff_charge` / `reimbursement` lines                            | only the expenses trigger                |
| `reimbursement_paid` (pay back now)                               | `salary.run`                             |

The owner has all of these in their shop. Nothing crosses shops. Update and delete on ledger
lines and advances are refused by a trigger, even for the database owner.
