# Expenses

Phase 6 (built before Android at the owner's request, 2026-10-24). Rules: docs/PLAN.md §4.8,
`packages/core/src/expenses.ts`. Design: "Web · expenses" on the FinCrew key screens canvas
(the phone "Add expense" artboard uses the same words).

## Data — `supabase/migrations/20261024000001_expenses.sql`

- `expense_categories`: name (unique per shop), `icon` and `colour` keys (the apps map them to
  icons and tokens), `archived`. No delete: old expenses keep their category.
- `expenses`: date, `amount_paise` (> 0), category, `payment_mode` (cash / upi / bank / card),
  note, `bill_path`, **paid by** (`owner` · `shop_cash` · `staff` + `paid_by_staff_id`),
  **charged to** (`shop` · `staff` + `charged_to_staff_id` · `not_tracked`), `reimburse` (only
  when paid by staff), `created_by` (stamped), `updated_at`. Checks keep the pairs consistent;
  composite foreign keys keep category and staff in the same shop.
- **Ledger** (trigger `private.post_expense`, mirrors core `expenseLedgerLines`): charged to
  staff → `staff_charge` (−amount) on their ledger; paid by staff with reimburse →
  `reimbursement` (+amount). Changing the date, amount, payer, charge or reimburse reverses the
  lines it posted (reversal dated today) and posts new ones; a note/category/mode/bill change
  moves no money; deleting reverses them. Direct inserts of these line types stay denied.
- **RLS**: categories readable by every member, written with `expenses.categories`. Expenses:
  `expenses.view_all` sees all; otherwise the ones you added and the ones paid by or charged to
  you. `expenses.add` inserts; `expenses.edit` updates and deletes.
- **Bill photos**: private Storage bucket `bills` (1 MB, JPEG/PNG/WebP), objects at
  `<shop_id>/<expense_id>-<time>.jpg`. Read: your own upload, or a bill an expense you can see
  points at. Upload into your shop's folder with `expenses.add`; remove with `expenses.edit`.
- Tests: `supabase/tests/expenses.test.ts` (17), with a Storage stand-in in `harness.ts`.

## Screens (website)

- **Expenses** (`(app)/expenses`; sidebar with `expenses.add`, `view_all` or `edit`). Redesign
  (owner, 29/10/2026; design "Web · expenses, today first + add in steps"): **Add expense** is the
  big header button. **Day | Month** picks the period (`?view=day&date=` with ‹ ›, Today and a
  DD/MM/YYYY filter `?day=`; `?view=month&month=`), **List | By category** how it shows
  (`?show=categories`), so categories work for a day or a month. The big figure is all money spent
  in the period with the shop / charged to staff / not counted split; the month adds bars per day
  (click a bar for that day), about how much a day and the busiest day (`dailySpending`). **Needs
  you**: what the shop owes each staff member for expenses with **Pay back now** (`salary.run`),
  what is charged to staff and not cut yet (`loadExpenseDues`, view `expense_balances`), and how
  many counted expenses have no bill photo (→ filter). The list has category chips plus "No bill
  photo" (`?cat=<id>|nobill`); a category row in By category opens the list filtered to it.
  Period sums: `expenseSummary` / `expenseDay` (`packages/data/src/expenses.ts`). Rows open the
  **edit panel** with `expenses.edit` (else a bill link); saving or deleting goes to the
  expense's day.
  **Add expense** is a dialog in **three steps** (`expense-form.tsx`): 1 amount and category
  (Save now: today, shop cash, cash); 2 Paid by **Shop cash or Staff** (+ who and **Give it
  back**: with the salary / now / not needed — "now" needs `salary.run` and also records a
  pay-back today with `payBackExpenses`; if only that part fails the page says so, `pb=0`), whose
  expense (shop / staff member / not tracked; starts as Not tracked below the small-expense
  limit), paid with, date; 3 note, bill photo (shrunk in the browser to about 200 KB,
  `src/lib/compress-image.ts`) and a summary. Editing shows every field at once, plus delete (two
  clicks). "Owner" as payer shows only on old expenses that used it.
  Actions: `expenses/actions.ts` (thin wrappers over `saveExpense` / `deleteExpense` in
  `packages/data/src/expense-write.ts`, shared with the Android app); bill link `expenses/bill/[id]` (one-minute signed URL);
  CSV `expenses/export?month=` (`reports.export`).
- **Settings → Expense categories** (`expenses.categories`): list with icon/colour, edit,
  archive / bring back, add (name, icon picker, colour swatches); with no active category it
  offers **Add the usual ones** (9 suggestions, renameable). Icons/colours: `src/lib/expense-style.ts`.
- **Dashboard**: "Shop expenses this month" tile with `expenses.view_all`.
- Staff ledgers show the lines as "Charged to staff" / "Reimbursement".

## Checked

Live shop, 2026-10-24: category add/archive, shop expense with bill photo (upload, view, CSV,
edit, delete with the file removed), dashboard tile, phone widths. Staff charge / pay-back only
in the DB tests (live would leave permanent lines on Test Staff's ledger).

## Not built yet

Expense reports beyond the month view (Phase 6 "reports"), editing your own expense without
`expenses.edit`. Android screens: built 2026-10-24 (`docs/features/fincrew-mobile.md` → Money).
