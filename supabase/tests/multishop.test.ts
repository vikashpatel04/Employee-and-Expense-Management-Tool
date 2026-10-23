import { beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Two shops owned by Asha.
 *   Ravi:  Supervisor (staff.view, settings.roles) in Shop 1, plain staff in Shop 2.
 *   Meena: staff in Shop 2 only.
 */
let db: Db;
let asha: string, ravi: string, meena: string;
let shop1: string, shop2: string;
let ravi1: string, ravi2: string, meena2: string, asha2: string;

const q = <T>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const perms = async (user: string, shop: string) =>
  (
    await q<{ k: string }>(user, 'select k from public.my_permissions($1) k order by 1', [shop])
  ).map((r) => r.k);

beforeAll(async () => {
  db = await freshDb();
  asha = await createAuthUser(db, 'asha@shop.test');
  ravi = await createAuthUser(db, 'ravi@shop.test');
  meena = await createAuthUser(db, 'meena@shop.test');

  shop1 = (
    await q<{ id: string }>(asha, `select public.create_shop('Main Road', 'Asha') as id`)
  )[0]!.id;
  shop2 = (
    await q<{ id: string }>(asha, `select public.create_shop('Market Branch', 'Asha') as id`)
  )[0]!.id;

  await as(db, asha, async (tx) => {
    const ins = async (shop: string, user: string, name: string) =>
      (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [shop, user, name],
        )
      ).rows[0]!.id;
    ravi1 = await ins(shop1, ravi, 'Ravi');
    ravi2 = await ins(shop2, ravi, 'Ravi K');
    meena2 = await ins(shop2, meena, 'Meena');
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Supervisor') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id)
       values ($1, 'staff.view', $2), ($1, 'settings.roles', $2)`,
      [role, shop1],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      ravi1,
      role,
      shop1,
    ]);
    asha2 = (
      await tx.query<{ id: string }>('select id from people where shop_id = $1 and is_owner', [
        shop2,
      ])
    ).rows[0]!.id;
  });
});

describe('creating shops', () => {
  it('an owner can add more shops and owns each one', async () => {
    expect(await perms(asha, shop1)).toEqual([...PERMISSIONS].sort());
    expect(await perms(asha, shop2)).toEqual([...PERMISSIONS].sort());
    const owned = await q<{ name: string }>(
      asha,
      'select s.name from people p join shops s on s.id = p.shop_id where p.auth_user_id = auth.uid() and p.is_owner order by 1',
    );
    expect(owned.map((r) => r.name)).toEqual(['Main Road', 'Market Branch']);
  });

  it('staff and supervisors cannot add shops', async () => {
    await rejects(q(ravi, `select public.create_shop('Mine', 'Ravi')`), /Only a shop owner/);
    await rejects(q(meena, `select public.create_shop('Mine', 'Meena')`), /Only a shop owner/);
  });
});

describe('permissions are per shop', () => {
  it('the same login has different permissions in each shop', async () => {
    expect(await perms(ravi, shop1)).toEqual(['settings.roles', 'staff.view']);
    expect(await perms(ravi, shop2)).toEqual([]);
  });

  it('no permissions in a shop you do not belong to', async () => {
    expect(await perms(meena, shop1)).toEqual([]);
  });
});

describe('isolation between shops', () => {
  it('members see only their shops', async () => {
    expect(
      (await q<{ name: string }>(ravi, 'select name from shops order by 1')).map((r) => r.name),
    ).toEqual(['Main Road', 'Market Branch']);
    expect((await q<{ name: string }>(meena, 'select name from shops')).map((r) => r.name)).toEqual(
      ['Market Branch'],
    );
  });

  it("a supervisor in shop 1 sees shop 1's people, but only themselves in shop 2", async () => {
    const rows = await q<{ shop_id: string; name: string }>(
      ravi,
      'select shop_id, name from people order by name',
    );
    expect(rows.filter((r) => r.shop_id === shop1).map((r) => r.name)).toEqual(['Asha', 'Ravi']);
    expect(rows.filter((r) => r.shop_id === shop2).map((r) => r.name)).toEqual(['Ravi K']);
  });

  it('staff in shop 2 see only their own record', async () => {
    expect(
      (await q<{ name: string }>(meena, 'select name from people')).map((r) => r.name),
    ).toEqual(['Meena']);
  });

  it('the owner sees everyone in both shops', async () => {
    expect((await q(asha, 'select 1 from people')).length).toBe(5);
  });

  it("settings.roles in shop 1 doesn't allow role changes in shop 2", async () => {
    await rejects(
      q(ravi, `insert into roles (shop_id, name) values ($1, 'Boss')`, [shop2]),
      /row-level security/,
    );
    const ok = await q<{ id: string }>(
      ravi,
      `insert into roles (shop_id, name) values ($1, 'Cashier') returning id`,
      [shop1],
    );
    expect(ok).toHaveLength(1);
  });

  it('a role cannot be given to someone in another shop', async () => {
    const role = (
      await q<{ id: string }>(
        asha,
        `select id from roles where shop_id = $1 and name = 'Supervisor'`,
        [shop1],
      )
    )[0]!.id;
    await rejects(
      q(asha, 'insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
        meena2,
        role,
        shop1,
      ]),
      /different shop/,
    );
  });

  it('one login can have only one record per shop', async () => {
    await rejects(
      q(asha, 'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3)', [
        shop1,
        ravi,
        'Ravi again',
      ]),
      /people_shop_login_unique|duplicate key/,
    );
  });
});

describe('audit log per shop', () => {
  it("records the actor's record in that shop", async () => {
    const rows = await q<{ actor_id: string }>(
      asha,
      `select actor_id from audit_log where table_name = 'people' and shop_id = $1 and after->>'name' = 'Meena'`,
      [shop2],
    );
    expect(rows).toEqual([{ actor_id: asha2 }]);
  });

  it('a supervisor without ownership reads no audit log anywhere', async () => {
    expect(await q(ravi, 'select 1 from audit_log')).toEqual([]);
  });

  it('ravi2 exists only in shop 2', async () => {
    const rows = await q<{ shop_id: string }>(asha, 'select shop_id from people where id = $1', [
      ravi2,
    ]);
    expect(rows).toEqual([{ shop_id: shop2 }]);
  });
});
