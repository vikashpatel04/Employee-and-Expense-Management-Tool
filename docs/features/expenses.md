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

- **Expenses** (`(app)/expenses`; sidebar with `expenses.add`, `view_all` or `edit`): month
  switcher; tiles Shop expenses / Charged to staff / Paid back to staff / Not tracked (core
  `expenseTotals`); By category with bars; list by day (DD/MM/YYYY) with payer, mode, charge,
  tags and a camera mark for bills. Rows open the **edit panel** with `expenses.edit` (else a
  bill link). **Add expense** (`?add=1`) opens the side panel (full screen on a phone): amount,
  date, category grid, Paid by (+ who, Pay them back), Charged to (+ who; starts as Not tracked
  below the shop's small-expense limit until changed), Paid with, note, bill photo (shrunk in
  the browser to about 200 KB, `src/lib/compress-image.ts`), delete (two clicks).
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
