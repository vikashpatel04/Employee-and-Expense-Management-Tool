import { beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Cast: owner, a "Supervisor" (custom role with staff.view + attendance.mark),
 * a plain staff member, and a signed-in stranger with no person record.
 */
let db: Db;
let owner: string, supervisor: string, staff: string, stranger: string;
let shopId: string, supervisorPerson: string, staffPerson: string, ownerPerson: string;
let roleId: string;

beforeAll(async () => {
  db = await freshDb();
  owner = await createAuthUser(db, 'owner@shop.test');
  supervisor = await createAuthUser(db, 'sup@shop.test');
  staff = await createAuthUser(db, 'staff@shop.test');
  stranger = await createAuthUser(db, 'stranger@elsewhere.test');

  shopId = await as(db, owner, async (tx) => {
    const r = await tx.query<{ id: string }>(`select public.setup_shop('Test Shop', 'Asha') as id`);
    return r.rows[0]!.id;
  });

  await as(db, owner, async (tx) => {
    ownerPerson = (await tx.query<{ id: string }>(`select id from people where is_owner`)).rows[0]!
      .id;
    supervisorPerson = (
      await tx.query<{ id: string }>(
        `insert into people (shop_id, auth_user_id, name) values ($1, $2, 'Ravi') returning id`,
        [shopId, supervisor],
      )
    ).rows[0]!.id;
    staffPerson = (
      await tx.query<{ id: string }>(
        `insert into people (shop_id, auth_user_id, name) values ($1, $2, 'Meena') returning id`,
        [shopId, staff],
      )
    ).rows[0]!.id;
    roleId = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Supervisor') returning id`,
        [shopId],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id)
       values ($1, 'staff.view', $2), ($1, 'attendance.mark', $2)`,
      [roleId, shopId],
    );
    await tx.query(`insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)`, [
      supervisorPerson,
      roleId,
      shopId,
    ]);
  });
});

const perms = (tx: { query: Db['query'] }) =>
  tx
    .query<{ k: string }>(`select k from public.my_permissions() k order by 1`)
    .then((r) => r.rows.map((x) => x.k));

describe('permission catalogue', () => {
  it('matches packages/core PERMISSIONS exactly', async () => {
    const rows = await db.query<{ key: string }>('select key from permissions order by key');
    expect(rows.rows.map((r) => r.key)).toEqual([...PERMISSIONS].sort());
  });
});

describe('ping', () => {
  it('is callable anonymously (keep-awake job)', async () => {
    const r = await as(db, null, (tx) => tx.query<{ t: Date }>(`select public.ping() as t`));
    expect(r.rows[0]!.t).toBeInstanceOf(Date);
  });
});

describe('setup_shop', () => {
  it('cannot be run a second time', async () => {
    await rejects(
      as(db, stranger, (tx) => tx.query(`select public.setup_shop('Other', 'X')`)),
      /already set up/,
    );
  });

  it('shop_exists tells signed-in strangers a shop is set up', async () => {
    const r = await as(db, stranger, (tx) =>
      tx.query<{ e: boolean }>(`select public.shop_exists() as e`),
    );
    expect(r.rows[0]!.e).toBe(true);
  });

  it('cannot be run by anonymous users', async () => {
    await rejects(
      as(db, null, (tx) => tx.query(`select public.setup_shop('Other', 'X')`)),
      /permission denied/,
    );
  });
});

describe('has_permission', () => {
  it('owner has every permission', async () => {
    expect(await as(db, owner, perms)).toEqual([...PERMISSIONS].sort());
  });

  it('custom role has exactly its ticked permissions', async () => {
    expect(await as(db, supervisor, perms)).toEqual(['attendance.mark', 'staff.view']);
  });

  it('staff and strangers have none', async () => {
    expect(await as(db, staff, perms)).toEqual([]);
    expect(await as(db, stranger, perms)).toEqual([]);
  });
});

describe('people RLS', () => {
  const visibleNames = (userId: string | null) =>
    as(db, userId, async (tx) =>
      (await tx.query<{ name: string }>('select name from people order by name')).rows.map(
        (r) => r.name,
      ),
    );

  it('owner and staff.view see everyone in the shop', async () => {
    expect(await visibleNames(owner)).toEqual(['Asha', 'Meena', 'Ravi']);
    expect(await visibleNames(supervisor)).toEqual(['Asha', 'Meena', 'Ravi']);
  });

  it('staff see only themselves', async () => {
    expect(await visibleNames(staff)).toEqual(['Meena']);
  });

  it('strangers see nothing and anon is denied', async () => {
    expect(await visibleNames(stranger)).toEqual([]);
    await rejects(visibleNames(null), /permission denied/);
  });

  it('without staff.edit, updates silently affect no rows', async () => {
    const res = await as(db, supervisor, (tx) =>
      tx.query(`update people set name = 'Hacked' where id = $1`, [staffPerson]),
    );
    expect(res.affectedRows).toBe(0);
  });

  it('staff cannot add people', async () => {
    await rejects(
      as(db, staff, (tx) =>
        tx.query(`insert into people (shop_id, name) values ($1, 'Ghost')`, [shopId]),
      ),
      /row-level security/,
    );
  });
});

describe('owner protection', () => {
  it('owner cannot be deleted, even by the owner', async () => {
    await rejects(
      as(db, owner, (tx) => tx.query(`delete from people where id = $1`, [ownerPerson])),
      /cannot be removed/,
    );
  });

  it('nobody can be made owner', async () => {
    await rejects(
      as(db, owner, (tx) =>
        tx.query(`update people set is_owner = true where id = $1`, [staffPerson]),
      ),
      /Ownership cannot be changed/,
    );
    await rejects(
      as(db, owner, (tx) =>
        tx.query(`insert into people (shop_id, name, is_owner) values ($1, 'Second', true)`, [
          shopId,
        ]),
      ),
      /created only by shop setup/,
    );
  });
});

describe('roles RLS', () => {
  it('supervisor sees own role but cannot edit roles', async () => {
    const names = await as(db, supervisor, async (tx) =>
      (await tx.query<{ name: string }>('select name from roles')).rows.map((r) => r.name),
    );
    expect(names).toEqual(['Supervisor']);
    await rejects(
      as(db, supervisor, (tx) =>
        tx.query(
          `insert into role_permissions (role_id, permission_key, shop_id) values ($1, 'salary.run', $2)`,
          [roleId, shopId],
        ),
      ),
      /row-level security/,
    );
  });

  it('staff without roles see none', async () => {
    const count = await as(
      db,
      staff,
      async (tx) =>
        (await tx.query<{ n: number }>('select count(*)::int as n from roles')).rows[0]!.n,
    );
    expect(count).toBe(0);
  });
});

describe('audit log', () => {
  it('records changes with the acting person', async () => {
    const rows = await as(
      db,
      owner,
      async (tx) =>
        (
          await tx.query<{ table_name: string; action: string; actor_id: string }>(
            `select table_name, action, actor_id from audit_log where table_name = 'roles'`,
          )
        ).rows,
    );
    expect(rows).toEqual([{ table_name: 'roles', action: 'INSERT', actor_id: ownerPerson }]);
  });

  it('only the owner can read it', async () => {
    const count = await as(
      db,
      supervisor,
      async (tx) =>
        (await tx.query<{ n: number }>('select count(*)::int as n from audit_log')).rows[0]!.n,
    );
    expect(count).toBe(0);
  });

  it('is append-only, even for the database owner', async () => {
    await rejects(db.query(`delete from audit_log`), /append-only/);
    await rejects(db.query(`update audit_log set action = 'DELETE'`), /append-only/);
  });

  it('users cannot write to it directly', async () => {
    await rejects(
      as(db, owner, (tx) =>
        tx.query(`insert into audit_log (table_name, action) values ('x', 'INSERT')`),
      ),
      /permission denied/,
    );
  });
});
