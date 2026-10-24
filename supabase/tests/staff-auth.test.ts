import { beforeAll, describe, expect, it } from 'vitest';
import { handle, staffEmail, type Deps } from '../functions/staff-auth/handler';
import { as, createAuthUser, freshDb, type Db } from './harness';

/**
 * The staff-auth edge function's logic (supabase/functions/staff-auth/handler.ts), with its
 * database calls going to the real SQL functions as service_role, and a fake Supabase Auth
 * (users in auth.users, passwords in a map).
 */
let db: Db;
let asha: string;
let shop: string, meenaP: string;
let token: string;
const passwords = new Map<string, string>();
let created = 0;

const deps: Deps = {
  rpc: async (fn, args) => {
    const names = Object.keys(args);
    try {
      const r = await db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        return tx.query<{ r: unknown }>(
          `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`,
          names.map((n) => args[n]),
        );
      });
      return { data: r.rows[0]!.r, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  },
  createUser: async (email) => {
    created++;
    return { id: await createAuthUser(db, email) };
  },
  getUserEmail: async (id) =>
    (await db.query<{ email: string }>('select email from auth.users where id = $1', [id])).rows[0]
      ?.email ?? null,
  setPassword: async (id, password) => {
    passwords.set(id, password);
    return null;
  },
  signIn: async (email, password) => {
    const id = (
      await db.query<{ id: string }>('select id from auth.users where email = $1', [email])
    ).rows[0]?.id;
    return id && passwords.get(id) === password
      ? { session: { access_token: `access-${id}`, refresh_token: `refresh-${id}` } }
      : { error: 'Invalid login credentials' };
  },
  randomPassword: () => Math.random().toString(36).slice(2),
};

beforeAll(async () => {
  db = await freshDb();
  asha = await createAuthUser(db, 'asha@shop.test');
  shop = (
    await as(db, asha, (tx) =>
      tx.query<{ id: string }>(`select public.create_shop('Main Road', 'Asha') as id`),
    )
  ).rows[0]!.id;
  meenaP = (
    await as(db, asha, async (tx) => {
      const id = (
        await tx.query<{ id: string }>(
          `insert into people (shop_id, name) values ($1, 'Meena') returning id`,
          [shop],
        )
      ).rows[0]!.id;
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
        [shop, id],
      );
      return { rows: [{ id }] };
    })
  ).rows[0]!.id;
  token = (
    await as(db, asha, (tx) =>
      tx.query<{ r: { token: string } }>('select public.create_invite($1) as r', [meenaP]),
    )
  ).rows[0]!.r.token;
});

describe('staff-auth', () => {
  it('rejects bad requests', async () => {
    expect((await handle(null, deps)).status).toBe(400);
    expect((await handle({ action: 'dance' }, deps)).status).toBe(400);
    expect((await handle({ action: 'accept', token, pin: '1234' }, deps)).status).toBe(400);
  });

  it('shows who an invite is for', async () => {
    expect(await handle({ action: 'invite', token }, deps)).toEqual({
      status: 200,
      body: { ok: true, name: 'Meena', shopName: 'Main Road' },
    });
    expect((await handle({ action: 'invite', token: 'nope' }, deps)).body).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('a bad PIN is refused before anything is made', async () => {
    expect(
      (await handle({ action: 'accept', token, pin: '12', deviceId: 'meena-phone-1' }, deps)).body,
    ).toEqual({ ok: false, reason: 'bad_pin' });
    expect(created).toBe(0);
  });

  it('accepting makes the sign-in, links it and returns a session', async () => {
    const r = await handle(
      { action: 'accept', token, pin: '4321', deviceId: 'meena-phone-1' },
      deps,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, personId: meenaP, shopId: shop });
    expect((r.body.session as { access_token: string }).access_token).toMatch(/^access-/);
    const linked = await db.query<{ email: string }>(
      'select u.email from people p join auth.users u on u.id = p.auth_user_id where p.id = $1',
      [meenaP],
    );
    expect(linked.rows[0]!.email).toBe(staffEmail(meenaP));
    expect(created).toBe(1);
  });

  it('the invite works once', async () => {
    expect(
      (await handle({ action: 'accept', token, pin: '4321', deviceId: 'meena-phone-1' }, deps))
        .body,
    ).toEqual({ ok: false, reason: 'used' });
  });

  it('signs in with the PIN on the bound phone', async () => {
    const r = await handle(
      { action: 'login', personId: meenaP, pin: '4321', deviceId: 'meena-phone-1' },
      deps,
    );
    expect(r.body).toMatchObject({ ok: true, personId: meenaP, shopId: shop });
    expect(
      (
        await handle(
          { action: 'login', personId: meenaP, pin: '0000', deviceId: 'meena-phone-1' },
          deps,
        )
      ).body,
    ).toEqual({ ok: false, reason: 'wrong_pin', triesLeft: 4 });
    expect(
      (
        await handle(
          { action: 'login', personId: meenaP, pin: '4321', deviceId: 'other-phone-1' },
          deps,
        )
      ).body,
    ).toEqual({ ok: false, reason: 'wrong_device' });
  });

  it('a new invite for someone who already has a sign-in reuses it (PIN reset)', async () => {
    const again = (
      await as(db, asha, (tx) =>
        tx.query<{ r: { token: string } }>('select public.create_invite($1) as r', [meenaP]),
      )
    ).rows[0]!.r.token;
    const r = await handle(
      { action: 'accept', token: again, pin: '9999', deviceId: 'meena-phone-1' },
      deps,
    );
    expect(r.body).toMatchObject({ ok: true });
    expect(created).toBe(1);
    expect(
      (
        await handle(
          { action: 'login', personId: meenaP, pin: '9999', deviceId: 'meena-phone-1' },
          deps,
        )
      ).body,
    ).toMatchObject({ ok: true });
  });
});
