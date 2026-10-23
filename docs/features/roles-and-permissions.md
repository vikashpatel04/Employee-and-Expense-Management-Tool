# Roles and permissions

PLAN §3. Status: **database done** (Phase 1); management screens come in Phase 4.

## How it works

- **Owner** (`people.is_owner`): one per shop, created by `setup_shop()`. `has_permission()`
  always returns true for them. Can't be deleted, demoted or duplicated (trigger `protect_owner`).
- **Custom roles**: `roles` → ticked keys in `role_permissions` → assigned in `person_roles`.
  A person can hold several roles; permissions are the union.
- **Staff**: a `people` row with no roles. Sees only their own row.

## Multi-shop

A login can belong to several shops, with a separate record, roles and owner flag in each.
Permissions are always "in this shop": owning shop A gives nothing in shop B. Tests:
`supabase/tests/multishop.test.ts`.

## Database

| Piece                                  | Where                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Permission keys                        | `permissions` table + `packages/core/src/permissions.ts` (kept in sync by a test)        |
| `private.has_permission(shop_id, key)` | used in every RLS policy (multi-shop: always the row's shop)                             |
| `my_permissions(p_shop)`               | apps call it to show/hide UI for the current shop                                        |
| Policies                               | `supabase/migrations/20261022000001_foundation.sql` (+ `harden_functions`, `multi_shop`) |
| Tests                                  | `supabase/tests/foundation.test.ts`                                                      |
| Function exposure                      | helpers in `private` (not on the API); `supabase/tests/functions.test.ts`                |

## What each person can see (today)

| Table     | Owner       | Role with `staff.view`                | Staff | Signed-in stranger | Anonymous |
| --------- | ----------- | ------------------------------------- | ----- | ------------------ | --------- |
| people    | all in shop | all in shop                           | self  | nothing            | denied    |
| roles     | all         | own roles (all with `settings.roles`) | none  | none               | denied    |
| audit_log | all         | none                                  | none  | none               | denied    |

Writes: `people` needs `staff.edit`; roles tables need `settings.roles`; shop needs `settings.shop`.
Without the permission, updates silently affect zero rows (RLS), inserts error.
