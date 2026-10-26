# Clear all data

Built 2026-10-26 (owner's request: empty the test data before real use). Settings → **Data**
tab, owner only.

- **Removes:** staff and helpers (and their sign-ins to the shop), attendance, leave balances,
  salary runs and payslips, advances and the whole ledger, expenses and their bill photos,
  requests, check-in scans, attendance codes, staff documents and their files.
- **Keeps:** the shop, the owner, settings, roles, leave templates, holidays, expense
  categories, and the **audit log** (every deleted row is also written to it, plus one
  `clear_shop_data` entry).
- **Safety:** owner only (`private.is_owner`, checked in the database); the website asks for the
  **shop name typed** and the owner's **password** again (checked by signing in with it on a
  separate client, `settings/data/actions.ts`). The owner's own session is not touched.
- **Append-only guards:** the ledger, advances and requests stay undeletable for everyone. The
  migration `20261026000003_clear_shop_data.sql` lets `private.reject_modification` stand aside
  only while the transaction flag `fincrew.clearing` is on, which only `public.clear_shop_data`
  sets (and it never applies to `audit_log`).
- Files in Storage (`bills`, `staff-docs`) are removed by the server action afterwards, using
  the paths the function returns.
- Left behind: staff and helper sign-in accounts in Supabase Auth are not deleted (no
  shop access any more; the phone number can be used again by a new staff member).
- Tests `supabase/tests/clear-data.test.ts` (5): owner only (even a role with every permission is
  refused), guards still hold, records gone and setup kept, another shop untouched, audit kept.
