# Add or less, what we owe, statements

Owner, 05/11/2026. Sample approved the same day. Designs: Claude Design, FinCrew key screens,
page "Add or less, statements": **Web · check and finalize, add or less**, **Web · staff page,
what we owe**, **Web · statement**, **Web · statement, historical**, **Salary · add or less**,
**Staff · statement**.

## Add or less (one month's salary)

Salary → Check and finalize: clicking a person opens a pop-up (website `?person=`, app bottom
sheet; this replaced the website's side panel and the app's open row). Its **Add or less** drop-down
button offers:

- **Add to salary**: bonus or anything extra, goes into gross.
- **Less from salary**: deduction or anything to take off.

Each has a name and an amount; any number of them. They change that month's figures at once, and
can be removed until the salary is finalized, then they lock.

- Table `salary_adjustments` (`20261105000002`): shop, staff, year, month, `add`/`less`, name up to
  60 letters, amount above zero. Read: yourself or `salary.view`; add and remove: `salary.run`.
  Never edited. A trigger refuses both once that person's month is finalized.
- `computeMonth` reads them, `calculateSalary` adds them (`adjustments`) exactly as typed: `add` as
  an `allowance` line, `less` as a `deduction` line, both with `oneOff: true`. So finalizing,
  ledger postings, the payslip and installed apps needed no change.
- A bonus raises what an advance can be cut from. A less bigger than the salary gives the existing
  `negative_net_pay` warning.
- Writes: `addSalaryEntry` / `removeSalaryEntry` in `packages/data/src/salary-run.ts`.
- Website: `(app)/salary/add-less.tsx`. App: `src/components/money/add-less.tsx`.

## What we owe (staff page)

A small tag beside the name on every tab: **We owe ₹…**, **Owes the shop ₹…** or **Settled**. Needs
`salary.view`, or it's your own page. The Overview card shows the same total, then Salary still to
pay, advance and expenses, so no two figures clash.

`loadMoneyNow` = ledger balance + each month not finalized (`moneyNow`), the same sum as Staffora's
Money. Months not finalized come from `loadOpenMonths`: every month from their first marked day to
the running one, except the finalized ones. Each counts before advance and expenses; the running
month counts up to today. The Ledger tab's figure is finalized lines only, and says so.

## The two statements

One split button on the staff page: **View statement**, with **Historical** in its drop-down. On
the website they are a page outside the app shell like a payslip, `/statements/[staffId]`
(`?view=historical`). In the app, `src/app/statement/[id].tsx`.

- **Statement**: what's open today. Salary left of each month with how it's made up, advances and
  expenses still open, how it adds up, and the final amount.
- **Historical**: totals so far and every line since joining with a running balance, grouped by
  month. A bonus shows apart from the salary line. Figures not finalized yet are tagged.

Both end on the same total as the tag. `packages/core/src/statement.ts` works it out
(`buildStatement`, `buildHistory`, `openItems`): advances and expenses are recovered oldest first,
so what's open is the newest. `other` is anything else on the ledger (opening balance, corrections),
shown as its own line so the sum always adds up. Undone lines drop out of open items and count with
what they undid.

**Sharing**: `packages/data/src/statement-document.ts` makes the page (plain HTML with its own paper
colours, everything typed is escaped) and the WhatsApp text, for both the website and the app.
Website: Print or save as PDF, and Send on WhatsApp. App: Share PDF (`expo-print`, `expo-sharing`)
and Send on WhatsApp. WhatsApp sends the sums; the PDF has the details. There is no public link:
it's private money data.

## Checks

- Core: `statement.test.ts`, the add or less block in `salary.test.ts`.
- Database: `supabase/tests/salary-adjustments.test.ts` (owner, roles, staff, shops, finalized lock).
- Page and text: `supabase/tests/statement-document.test.ts` (sample figures, DD/MM/YYYY, escaping,
  owing the shop). `STATEMENT_OUT=<folder>` writes the pages to look at or print.
