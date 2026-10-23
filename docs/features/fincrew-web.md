# FinCrew website screens

Phase 4.3, built from the reviewed key screens (`docs/DESIGN.md`) with `@fincrew/ui/tokens.css`,
the design's text styles and Lucide icons (24px, 2px stroke, the design system's fallback set).

## App shell — `apps/fincrew-web/src/app/(app)/layout.tsx`

- Sidebar (design: "Web · attendance grid"): FinCrew, the **shop switcher** card (current shop,
  "N shops"; opens the list to switch, plus "Add a shop" for owners), the sections, sign out.
  On a phone the sidebar stacks above the content.
- **Sections appear only when built and permitted**: Dashboard always; Staff with `staff.view`.
  Attendance, Salary, Expenses, Advances, Requests, Reports and Settings join as they ship.
- Pages outside the shell: `/login`, `/setup` (first run), `/shops/new`.

## Staff — `(app)/staff`

- **List** (`staff.view`): name with avatar, phone, joined, Active/Left; search by name or phone;
  show Active (default) / Left / All. Empty state for a new shop.
- **Add staff** (`staff.edit`, `/staff/new`): full name, phone (optional), joining date (defaults
  to today, IST). Calls `add_staff` (migration `20261023000005_add_staff.sql`), which writes the
  person and the staff row in one transaction under the caller's own access rules. Pay settings,
  leave template and the Staffora invite come with the staff detail screen.

## Not built yet

Staff detail (overview, attendance calendar, ledger, pay), attendance grid, salary run, advances,
requests, settings screens for every rule in `docs/features/core-rules.md`.
