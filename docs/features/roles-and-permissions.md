# Roles and permissions

PLAN §3. Status: **database done** (Phase 1); management screens come in Phase 4.

## How it works

- **Owner** (`people.is_owner`): one per shop, created by `setup_shop()`. `has_permission()`
  always returns true for them. Can't be deleted, demoted or duplicated (trigger `protect_owner`).
- **Custom roles**: `roles` → ticked keys in `role_permissions` → assigned in `person_roles`.
  A person can hold several roles; permissions are the union.
- **Staff**: a `people` row with no roles. Sees only their own row.

## Database

| Piece                 | Where                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| Permission keys       | `permissions` table + `packages/core/src/permissions.ts` (kept in sync by a test) |
| `has_permission(key)` | used in every RLS policy                                                          |
| `my_permissions()`    | apps call it to show/hide UI                                                      |
| Policies              | `supabase/migrations/20261022000001_foundation.sql`                               |
| Tests                 | `supabase/tests/foundation.test.ts`                                               |

## What each person can see (today)

| Table     | Owner       | Role with `staff.view`                | Staff | Signed-in stranger | Anonymous |
| --------- | ----------- | ------------------------------------- | ----- | ------------------ | --------- |
| people    | all in shop | all in shop                           | self  | nothing            | denied    |
| roles     | all         | own roles (all with `settings.roles`) | none  | none               | denied    |
| audit_log | all         | none                                  | none  | none               | denied    |

Writes: `people` needs `staff.edit`; roles tables need `settings.roles`; shop needs `settings.shop`.
Without the permission, updates silently affect zero rows (RLS), inserts error.
