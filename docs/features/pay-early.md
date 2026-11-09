# Pay early: keep the pay day or a new cycle, and Paid on

Owner, 08–09/11/2026 (Diwali: some staff wanted a bonus, some their salary, before the pay day).
Designs: Claude Design, FinCrew key screens, page "Pay early, new cycle": **Web · pay now: keep
the 16th or a new cycle**, **Web · pay a finalized salary, paid on**, **App · pay now**,
**Web · after paying early: statements, pay day, Staffora**.

## Paid on

Every salary payment has a **Paid on** date, today by default, changeable to an earlier day, never
a later one. It is the ledger date, so statements and Historical show the real day. Website: the
Pay dialog (with an amount to pay part of one person's salary). App: the salary run's Pay sheet and
the staff page's Pay. The database refuses a salary payment dated after today (`check_ledger_entry`).

## Pay now (a month still running)

While a person's period isn't over, their pop-up (website) or sheet (app) shows **Pay now** instead
of Finalize. It asks Paid on, how it was paid, and what happens to the pay day:

- **Keep the pay day** (`payEarly`): any amount towards this salary. Its live figures are saved as
  the draft payslip and the payment points at it, so it comes off when the salary is finalized; the
  rest is paid on the usual pay date. More than the salary so far is allowed (the extra comes off
  the next salary). Quick amounts: each Add or less addition (a bonus) and the salary so far. A draft
  with payments can't be deleted.
- **New cycle from the date paid** (`startNewCycle`): the salary closes the day before, is finalized
  and what's left of it is paid that day. From then on the person's pay day is that date of the
  month: `finalize_new_cycle` writes it into their pay setting from that day (and any later one).
  The next salary runs from the date paid to the day before the same date next month.

The closed salary pays its days at the full period's day rate (core `closesOn`): 23 days of a
31-day period is 23/31 of the salary, never a full month; allowances and deductions count their
share of the full period too. Days after the close belong to the next salary, so nothing is lost or
paid twice. A new cycle must start in the month the salary is named after, from its 2nd, no later
than today (core `newCycleCheck`); otherwise the form says why and suggests keeping the pay day.

`previewNewCycle` works the figures out before paying (the form shows them as you change the date).

## Where it shows

- Salary page: a draft paid early shows **Paid so far** and **Still to pay so far**; a salary closed
  early shows "closed early, new cycle from …" instead of its pay date.
- Statements: a month paid early shows it under Paid; a month closed early says so. The staff page
  total, Staffora's Money and the statements all take early payments off the month not finalized,
  not off finalized salary (`moneyNow` `paidEarly`).
- Staffora Money: each payment made early shows under its month ("Paid on 08/11/2026").

## Code

- Core: `salary.ts` (`closesOn`), `pay-period.ts` (`newCycleCheck`, `newCycleEarliest`),
  `ledger.ts` (`moneyNow` `paidEarly`), `statement.ts` (`newCycleFrom`).
- Database: `20261109000001_pay_early_new_cycle.sql` (`payslips.new_cycle_from`, payments against a
  draft, the Paid on check, `finalize_new_cycle`). Tests: `supabase/tests/pay-early.test.ts`.
- Data: `salary-run.ts` (`payEarly`, `previewNewCycle`, `startNewCycle`, `paySalary` `date`),
  `salary-month.ts` (`computeMonth` `closes`), `statement.ts` (payments made early).
- Website: `(app)/salary/pay-now.tsx`, `add-less.tsx` (`PersonDialog` switches to it),
  `controls.tsx` (Pay with Paid on and amount). App: `src/components/money/pay-now.tsx`.
