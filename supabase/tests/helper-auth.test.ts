import { beforeAll, describe, expect, it } from 'vitest';
import { handle, type Deps } from '../functions/helper-auth/handler';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Helper sign-ins (migration 20261026000001, edge function helper-auth): the handler with its
 * caller RPC run as a signed-in user, its service RPCs as service_role, and a fake Supabase Auth.
 *
 *   Asha:  owner of Main Road and of Bazaar.
 *   Ravi:  Main Road helper with the "Manager" role (staff.edit).
 *   Devi:  Main Road helper, no sign-in yet.   Meena: Main Road staff (Staffora, not a helper).
 *   Kala:  helper at Main Road and, already signed in, at Bazaar.
 */
let db: Db;
let asha: string, ravi: string, kalaUser: string;
let shop: string, bazaar: string;
let raviP: string, deviP: string, meenaP: string, kalaP: string;
const passwords = new Map<string, string>();
const mustChange = new Set<string>();
const deleted: string[] = [];

const sql = (fn: string, args: Record<string, unknown>) => {
  const names = Object.keys(args);
  return `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
};

function depsFor(caller: string): Deps {
  return {
    asCaller: async (fn, args) => {
      try {
        const r = await as(db, caller, (tx) =>
          tx.query<{ r: unknown }>(sql(fn, args), Object.values(args)),
        );
        return { data: r.rows[0]!.r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    rpc: async (fn, args) => {
      try {
        const r = await db.transaction(async (tx) => {
          await tx.exec('set local role service_role');
          return tx.query<{ r: unknown }>(sql(fn, args), Object.values(args));
        });
        return { data: r.rows[0]!.r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    createUser: async (email, password) => {
      if (password.length < 6) return { error: 'Password should be at least 6 characters.' };
      const id = await createAuthUser(db, email);
      passwords.set(id, password);
      mustChange.add(id);
      return { id };
    },
    resetPassword: async (id, password) => {
      passwords.set(id, password);
      mustChange.add(id);
      return null;
    },
    deleteUser: async (id) => {
      deleted.push(id);
      await db.query('delete from auth.users where id = $1', [id]);
      return null;
    },
  };
}

const linkOf = async (personId: string) =>
  (
    await db.query<{ auth_user_id: string | null; login_email: string | null }>(
      'select auth_user_id, login_email from people where id = $1',
      [personId],
    )
  ).rows[0]!;

beforeAll(async () => {
  db = await freshDb();
  asha = await createAuthUser(db, 'asha@shop.test');
  ravi = await createAuthUser(db, 'ravi@shop.test');
  kalaUser = await createAuthUser(db, 'kala@shop.test');
  shop = (
    await as(db, asha, (tx) =>
      tx.query<{ id: string }>(`select public.create_shop('Main Road', 'Asha') as id`),
    )
  ).rows[0]!.id;
  bazaar = (
    await as(db, asha, (tx) =>
      tx.query<{ id: string }>(`select public.create_shop('Bazaar', 'Asha') as id`),
    )
  ).rows[0]!.id;

  await db.transaction(async (tx) => {
    const person = async (shopId: string, user: string | null, name: string) =>
      (
        await tx.query<{ id: string }>(
          `insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id`,
          [shopId, user, name],
        )
      ).rows[0]!.id;
    raviP = await person(shop, ravi, 'Ravi');
    deviP = await person(shop, null, 'Devi');
    meenaP = await person(shop, null, 'Meena');
    kalaP = await person(shop, null, 'Kala');
    await person(bazaar, kalaUser, 'Kala');
    await tx.query(
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
      [shop, meenaP],
    );
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Manager') returning id`,
        [shop],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id) values ($1, 'staff.edit', $2)`,
      [role, shop],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      raviP,
      role,
      shop,
    ]);
  });
});

describe('helper-auth', () => {
  it('rejects bad requests', async () => {
    expect((await handle(null, depsFor(asha))).status).toBe(400);
    expect((await handle({ action: 'give' }, depsFor(asha))).status).toBe(400);
    expect((await handle({ action: 'dance', personId: deviP }, depsFor(asha))).status).toBe(400);
  });

  it('only for helpers: not the owner, not staff', async () => {
    const ashaP = (
      await db.query<{ id: string }>('select id from people where auth_user_id = $1', [asha])
    ).rows[0]!.id;
    const give = (personId: string) =>
      handle(
        { action: 'give', personId, email: 'x@y.test', password: 'first-pass' },
        depsFor(asha),
      );
    expect((await give(ashaP)).body).toEqual({ ok: false, reason: 'owner' });
    expect((await give(meenaP)).body).toEqual({ ok: false, reason: 'staff' });
  });

  it('needs staff.edit in that shop', async () => {
    const give = {
      action: 'give',
      personId: deviP,
      email: 'devi@mail.test',
      password: 'first-pass',
    };
    // Kala (Bazaar only) isn't a member of Main Road.
    expect((await handle(give, depsFor(kalaUser))).body).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('checks the email and passes the password rules on from Supabase Auth', async () => {
    const give = (email: string, password: string) =>
      handle({ action: 'give', personId: deviP, email, password }, depsFor(asha));
    expect((await give('not an email', 'first-pass')).body).toEqual({
      ok: false,
      reason: 'bad_email',
    });
    expect((await give('devi@mail.test', '123')).body).toEqual({
      ok: false,
      reason: 'password',
      message: 'Password should be at least 6 characters.',
    });
    expect((await linkOf(deviP)).auth_user_id).toBeNull();
  });

  it('gives a new sign-in (Ravi, a Manager with staff.edit): linked, must change the password', async () => {
    const r = await handle(
      { action: 'give', personId: deviP, email: ' Devi@Mail.test ', password: 'first-pass' },
      depsFor(ravi),
    );
    expect(r.body).toEqual({ ok: true, linked: 'new' });
    const link = await linkOf(deviP);
    expect(link.login_email).toBe('devi@mail.test');
    expect(passwords.get(link.auth_user_id!)).toBe('first-pass');
    expect(mustChange.has(link.auth_user_id!)).toBe(true);
    expect(
      (
        await handle(
          { action: 'give', personId: deviP, email: 'other@mail.test', password: 'x-pass-1' },
          depsFor(asha),
        )
      ).body,
    ).toEqual({ ok: false, reason: 'has_login' });
  });

  it('the new sign-in belongs to Main Road', async () => {
    const devi = (await linkOf(deviP)).auth_user_id!;
    const shops = await as(db, devi, (tx) =>
      tx.query<{ shop_id: string }>('select shop_id from people where auth_user_id = auth.uid()'),
    );
    expect(shops.rows.map((x) => x.shop_id)).toEqual([shop]);
  });

  it('an email that already signs in elsewhere is linked, keeping its own password', async () => {
    const r = await handle(
      { action: 'give', personId: kalaP, email: 'kala@shop.test', password: '' },
      depsFor(asha),
    );
    expect(r.body).toEqual({ ok: true, linked: 'existing' });
    expect((await linkOf(kalaP)).auth_user_id).toBe(kalaUser);
    expect(passwords.has(kalaUser)).toBe(false);
  });

  it('reset sets a new first password, except for a sign-in used in other shops', async () => {
    const reset = (personId: string) =>
      handle({ action: 'reset', personId, password: 'second-pass' }, depsFor(asha));
    expect((await reset(deviP)).body).toEqual({ ok: true });
    expect(passwords.get((await linkOf(deviP)).auth_user_id!)).toBe('second-pass');
    expect((await reset(kalaP)).body).toEqual({ ok: false, reason: 'other_shops' });
  });

  it('remove unlinks; the sign-in is deleted unless another shop uses it', async () => {
    const devi = (await linkOf(deviP)).auth_user_id!;
    expect((await handle({ action: 'remove', personId: deviP }, depsFor(asha))).body).toEqual({
      ok: true,
    });
    expect(await linkOf(deviP)).toEqual({ auth_user_id: null, login_email: null });
    expect(deleted).toEqual([devi]);

    expect((await handle({ action: 'remove', personId: kalaP }, depsFor(asha))).body).toEqual({
      ok: true,
    });
    expect((await linkOf(kalaP)).auth_user_id).toBeNull();
    expect(deleted).toEqual([devi]); // Kala's sign-in stays for Bazaar
    expect((await handle({ action: 'remove', personId: kalaP }, depsFor(asha))).body).toEqual({
      ok: false,
      reason: 'no_login',
    });
  });

  it('nobody can change a sign-in link through the API', async () => {
    await rejects(
      as(db, asha, (tx) =>
        tx.query('update people set auth_user_id = $1 where id = $2', [kalaUser, deviP]),
      ),
      /changed by the shop's sign-in screens only/,
    );
    await rejects(
      as(db, asha, (tx) =>
        tx.query(`update people set login_email = 'x@y.test' where id = $1`, [deviP]),
      ),
      /changed by the shop's sign-in screens only/,
    );
    // Other details still change as before.
    await as(db, asha, (tx) =>
      tx.query(`update people set name = 'Devi R' where id = $1`, [deviP]),
    );
  });

  it('the service functions are not callable by signed-in users', async () => {
    await rejects(
      as(db, asha, (tx) => tx.query(`select public.auth_user_by_email('asha@shop.test')`)),
      /permission denied/,
    );
    await rejects(
      as(db, asha, (tx) =>
        tx.query('select public.helper_login_link($1, $2, $3)', [deviP, asha, 'a@b.c']),
      ),
      /permission denied/,
    );
  });
});
