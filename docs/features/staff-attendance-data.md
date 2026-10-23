# Staff, pay, leave and attendance data

Phase 4.1 database layer. Migration `supabase/migrations/20261023000003_staff_attendance.sql`,
tests `supabase/tests/staff-attendance.test.ts`. Screens come later in Phase 4.

Status: **schema + access rules done, not yet live** (applies on the next push). The website
doesn't use these tables yet; regenerate DB types (`pnpm db:types`) after the push.

## Tables

| Table                             | Holds                                                                                                                     | Maps to `packages/core`                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `staff`                           | joining/leaving date, status, self attendance on/off, bound device, advance limit                                         | `SalaryInput.joiningDate/leavingDate`, `checkAdvance.limit` |
| `pay_settings`                    | dated: pay type, salary/wage/rate, overtime rate, shift, grace, `day_minutes`, late-policy and pay-rule overrides (jsonb) | `PaySettings` (`hoursPerDay` = `day_minutes / 60`)          |
| `allowances` / `fixed_deductions` | name, amount, prorated (allowances), from/to dates                                                                        | `Allowance` / `FixedDeduction`                              |
| `leave_templates`                 | named template per shop                                                                                                   | —                                                           |
| `leave_template_versions`         | dated: weekly offs, paid leaves/month, carry-over, sandwich, accrual (jsonb in core's shapes)                             | `LeaveTemplateVersion`                                      |
| `staff_leave_templates`           | dated template assignment                                                                                                 | `TemplateAssignment`                                        |
| `holidays`                        | date, name, paid                                                                                                          | `Holiday`                                                   |
| `attendance`                      | one row per staff per day: status, check-in/out instants, overtime minutes, source, who marked it, note                   | `AttendanceRecord` (times → `minutesOfDayIST`)              |

Money columns end in `_paise` (bigint). Shift times are minutes after IST midnight. Late minutes
are **not stored**: `packages/core` computes them from check-in and the shift, so changing a
shift or the late policy never leaves stale numbers.

## Multi-shop safety

Every child row carries `shop_id` and uses composite foreign keys, e.g.
`(shop_id, staff_id) → staff (shop_id, person_id)`, so the database itself refuses a row that
points at another shop's staff, template or person. Policies check the row's shop.

## Who can do what

| Table                                      | Read                                        | Write                                                                             |
| ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------- |
| staff                                      | yourself · `staff.view`                     | `staff.edit` (no deletes: set a leaving date)                                     |
| pay_settings, allowances, fixed_deductions | yourself · `staff.pay.view`                 | `staff.pay.edit`                                                                  |
| leave_templates, versions                  | everyone in the shop                        | `settings.leave_templates`                                                        |
| staff_leave_templates                      | yourself · `staff.view`                     | `staff.edit`                                                                      |
| holidays                                   | everyone in the shop                        | `settings.leave_templates`                                                        |
| attendance                                 | yourself · `staff.view` · `attendance.mark` | `attendance.mark` for today onward; earlier days also need `attendance.edit_past` |

The shop owner has every permission in their shop. Anonymous users get nothing. Self check-in
(Staffora) will write attendance through an edge function with the service role (Phase 7), so
staff can't mark themselves through the API. `attendance.marked_by` is set by a trigger to the
marker's record in that shop; every table is audited.

Validation the database doesn't do (the app does it with `packages/core` before writing):
paid leave only while balance remains, template version shapes (`validateTemplateVersion`),
shop settings (`validateShopRules`).
