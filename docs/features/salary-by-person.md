# Salary by person

Owner, 13/11/2026: "since there is no proper month base salary we don't want monthly view in
salary.. it should be by person.. each staff pay have their own cycle". Designs: Claude Design,
FinCrew key screens, page "Salary by person": **Web · salary by person** and **App · salary by
person** (tweak `start` opens the list or one person).

## What it shows

**Salary list** (website `/salary`, FinCrew Money → Salary): no months, no month arrows.

- **To pay now**: salaries that ended and aren't finalized, plus finalized ones not fully paid.
- **Running so far**: each person's salary running today, less anything paid early.
- **Next pay dates**: the soonest three.
- **Needs you**: people with a salary to finalize or pay (oldest first); **Running**: everyone else,
  with their pay day, dates and days left.

**One person** (website `/salary/<staff id>`, app `salary/[id]`):

- Their pay day, "We owe ₹…", View statement (website) and the staff page.
- A highlighted card for each salary that needs something: **Finalize** (asks first; Add or less
  still works on it) or **Pay** (Paid on, amount, how, WhatsApp payslip in the app).
- **This salary · running**: its dates, days so far, lines, Add or less, paid so far, take-home so
  far, **Pay now** (keep the pay day or a new cycle; `docs/features/pay-early.md`).
- **Earlier salaries**: each finalized one with take-home, paid, left, the last payment date, the
  payslip, and "closed early, new cycle from …" where that happened.

The month-wide Finalize everyone, Pay everyone and the full month table are gone: each person is
finalized and paid from their own page. The dashboard and the payslip page link to the list and
to the person.

## How it works

Nothing changed in the database. Salaries are still stored under the month their period ends in
(`salary_runs`, `payslips`); the screens just never show it. `packages/data/src/salary-people.ts`:

- `loadSalaryPeople(shopId, today, staffId?)` works out, per person, which months are open: every
  month from their first marked day to the one running today that isn't finalized, plus finalized
  ones not fully paid. Only those months are worked out (`loadSalaryRun` per month, shared by
  everyone), so the list stays quick. An ended salary nothing was ever marked for (before the shop
  used FinCrew for that person) is left out; a running one always shows.
- `salaryStage`: `finalize` (draft, period over), `pay` (finalized, not fully paid), `running`,
  `done`. `leftToPay` = take-home less what's paid (paid early counts).
- `loadPersonSalary` adds every earlier finalized salary with what's paid and when.

Checks: `supabase/tests/salary-people.test.ts` (stages, still to pay, days left). The loaders read
the live shop through RLS, so they were not run here without a sign-in.
