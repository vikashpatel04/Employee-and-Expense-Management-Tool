import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_STAFF_LOGIN, evaluatePinAttempt, type PinState } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Invites and PIN sign-in (migration 20261024000005).
 *   Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Manager" role: staff.edit.
 *   Meena: Shop 1 staff, no sign-in yet (gets invited).
 *   Selvi: Shop 1 staff, no sign-in (left the shop).
 *   Arun:  Shop 1 staff for the core-parity scenario.
 *   Kiran: Shop 2 staff with a sign-in (other shop).
 * The edge function's calls are made as service_role. Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, kiran: string, meenaUser: string, arunUser: string;
let shop1: string, shop2: string;
let ashaP: string, meenaP: string, selviP: string, arunP: string;
let token: string;

const PHONE = 'meena-phone-0001';
const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const one = async <T>(user: string | null, sql: string, params: unknown[] = []) =>
  (await q<{ r: T }>(user, sql, params))[0]!.r;
/** As the edge function: the service role, no signed-in user. */
const server = <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<{ r: T }>(sql, params)).rows[0]!.r;
  });

type R = {
  ok: boolean;
  reason?: string;
  retryAt?: string;
  triesLeft?: number;
  [k: string]: unknown;
};

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, kiran, meenaUser, arunUser] = (await Promise.all(
    ['asha', 'ravi', 'kiran', 'meena', 'arun'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string, string, string];
  const shop = async (name: string) =>
    (await q<{ id: string }>(asha, `select public.create_shop($1, 'Asha') as id`, [name]))[0]!.id;
  shop1 = await shop('Main Road');
  shop2 = await shop('Market');
  ashaP = (await q<{ id: string }>(asha, 'select id from people where shop_id = $1', [shop1]))[0]!
    .id;
  await as(db, asha, async (tx) => {
    const person = async (s: string, user: string | null, name: string, staff: boolean) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [s, user, name],
        )
      ).rows[0]!.id;
      if (staff)
        await tx.query(
          `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
          [s, id],
        );
      return id;
    };
    const raviP = await person(shop1, ravi, 'Ravi', false);
    meenaP = await person(shop1, null, 'Meena', true);
    selviP = await person(shop1, null, 'Selvi', true);
    arunP = await person(shop1, null, 'Arun', true);
    await person(shop2, kiran, 'Kiran', true);
    await tx.query(
      `update staff set status = 'left', leaving_date = '2026-06-30' where person_id = $1`,
      [selviP],
    );
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Manager') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id) values ($1, 'staff.edit', $2)`,
      [role, shop1],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      raviP,
      role,
      shop1,
    ]);
  });
});

describe('invites', () => {
  it('staff.edit makes an invite: a long token that lasts 48 hours by default', async () => {
    const r = await one<{ token: string; expiresAt: string }>(
      ravi,
      'select public.create_invite($1) as r',
      [meenaP],
    );
    expect(r.token).toMatch(/^[0-9a-f]{48}$/);
    const hours = (Date.parse(r.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThanOrEqual(48);
    token = r.token;
  });

  it('not for the owner, people who left, other shops, or without staff.edit', async () => {
    await rejects(q(asha, 'select public.create_invite($1)', [ashaP]), /owner signs in with email/);
    await rejects(q(asha, 'select public.create_invite($1)', [selviP]), /has left/);
    await rejects(q(kiran, 'select public.create_invite($1)', [meenaP]), /Not allowed/);
    await rejects(q(null, 'select public.create_invite($1)', [meenaP]), /permission denied/);
  });

  it('only the hash is stored; staff.edit sees the invite but never the hash', async () => {
    const rows = await q(ravi, 'select person_id, used_at from invites');
    expect(rows).toEqual([{ person_id: meenaP, used_at: null }]);
    await rejects(q(asha, 'select token_hash from invites'), /permission denied/);
    await rejects(q(asha, 'select * from pin_credentials'), /permission denied/);
    await rejects(
      q(
        asha,
        `insert into invites (shop_id, person_id, token_hash, expires_at)
               values ($1, $2, 'x', now())`,
        [shop1, meenaP],
      ),
      /permission denied/,
    );
  });

  it('a new invite cancels the old one', async () => {
    const old = token;
    token = (await one<{ token: string }>(asha, 'select public.create_invite($1) as r', [meenaP]))
      .token;
    expect(await server<R>('select public.invite_lookup($1) as r', [old])).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('the server looks the invite up', async () => {
    expect(await server<R>('select public.invite_lookup($1) as r', [token])).toEqual({
      ok: true,
      personId: meenaP,
      shopId: shop1,
      name: 'Meena',
      shopName: 'Main Road',
      authUserId: null,
    });
    expect(await server<R>('select public.invite_lookup($1) as r', ['nope'])).toMatchObject({
      reason: 'invalid',
    });
  });

  it('apps cannot call the server-only functions', async () => {
    for (const user of [null, asha]) {
      await rejects(q(user, 'select public.invite_lookup($1)', [token]), /permission denied/);
      await rejects(
        q(user, `select public.invite_accept($1, '1234', $2, $3)`, [token, PHONE, meenaUser]),
        /permission denied/,
      );
      await rejects(
        q(user, `select public.pin_login($1, '1234', $2)`, [meenaP, PHONE]),
        /permission denied/,
      );
    }
  });

  it('accepting needs a 4-digit PIN', async () => {
    expect(
      await server<R>(`select public.invite_accept($1, '12a4', $2, $3) as r`, [
        token,
        PHONE,
        meenaUser,
      ]),
    ).toEqual({ ok: false, reason: 'bad_pin' });
  });

  it('accepting links the sign-in, saves the PIN, binds the phone and uses the invite', async () => {
    expect(
      await server<R>(`select public.invite_accept($1, '4321', $2, $3) as r`, [
        token,
        PHONE,
        meenaUser,
      ]),
    ).toEqual({ ok: true, personId: meenaP, shopId: shop1 });
    const p = await db.query<{ auth_user_id: string; device_id: string; pin_hash: string }>(
      `select p.auth_user_id, s.device_id, c.pin_hash from people p
       join staff s on s.person_id = p.id join pin_credentials c on c.person_id = p.id
       where p.id = $1`,
      [meenaP],
    );
    expect(p.rows[0]).toMatchObject({ auth_user_id: meenaUser, device_id: PHONE });
    expect(p.rows[0]!.pin_hash).not.toContain('4321');
    expect(await server<R>('select public.invite_lookup($1) as r', [token])).toEqual({
      ok: false,
      reason: 'used',
    });
  });

  it('an expired invite is refused', async () => {
    const t = (await one<{ token: string }>(asha, 'select public.create_invite($1) as r', [arunP]))
      .token;
    await db.query(
      `update invites set expires_at = now() - interval '1 minute' where person_id = $1`,
      [arunP],
    );
    expect(await server<R>('select public.invite_lookup($1) as r', [t])).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('PIN sign-in', () => {
  const login = (pin: string, device = PHONE) =>
    server<R>('select public.pin_login($1, $2, $3) as r', [meenaP, pin, device]);

  it('the right PIN on the bound phone signs in', async () => {
    expect(await login('4321')).toEqual({ ok: true, authUserId: meenaUser, shopId: shop1 });
  });

  it('another phone is refused without counting', async () => {
    expect(await login('0000', 'stolen-phone-0001')).toEqual({ ok: false, reason: 'wrong_device' });
    const c = await db.query<{ failed_attempts: number }>(
      'select failed_attempts from pin_credentials where person_id = $1',
      [meenaP],
    );
    expect(c.rows[0]!.failed_attempts).toBe(0);
  });

  it('a wrong PIN says how many tries are left', async () => {
    expect(await login('0000')).toEqual({ ok: false, reason: 'wrong_pin', triesLeft: 4 });
  });

  it('staff.edit sees the state, unlocks, and resets the phone', async () => {
    await db.query(`update pin_credentials set locked = true where person_id = $1`, [meenaP]);
    const rows = await q<{
      person_id: string;
      locked: boolean;
      phone_bound: boolean;
      has_pin: boolean;
    }>(ravi, 'select * from public.staff_logins($1) where person_id = $2', [shop1, meenaP]);
    expect(rows[0]).toMatchObject({ locked: true, phone_bound: true, has_pin: true });
    expect(await login('4321')).toEqual({ ok: false, reason: 'locked' });
    await q(ravi, 'select public.unlock_login($1)', [meenaP]);
    await q(ravi, 'select public.reset_staff_phone($1)', [meenaP]);
    // With no phone bound, the next good sign-in binds the new one.
    expect(await login('4321', 'new-phone-00001')).toMatchObject({ ok: true });
    const s = await db.query<{ device_id: string }>(
      'select device_id from staff where person_id = $1',
      [meenaP],
    );
    expect(s.rows[0]!.device_id).toBe('new-phone-00001');
    await rejects(q(kiran, 'select public.unlock_login($1)', [meenaP]), /Not allowed/);
    await rejects(q(kiran, 'select * from public.staff_logins($1)', [shop1]), /Not allowed/);
  });

  it('people who left cannot sign in', async () => {
    await db.query(
      `update staff set status = 'left', leaving_date = '2026-10-01' where person_id = $1`,
      [meenaP],
    );
    expect(await login('4321', 'new-phone-00001')).toEqual({ ok: false, reason: 'left' });
    await db.query(`update staff set status = 'active', leaving_date = null where person_id = $1`, [
      meenaP,
    ]);
  });

  it('the SQL defaults are the core defaults', async () => {
    const r = await db.query<{ s: unknown }>('select private.login_settings($1) as s', [shop1]);
    expect(r.rows[0]!.s).toEqual(DEFAULT_STAFF_LOGIN);
  });
});

describe('the database follows the core rules (evaluatePinAttempt)', () => {
  it('gives the same result as core for a run of attempts', async () => {
    const t = (await one<{ token: string }>(asha, 'select public.create_invite($1) as r', [arunP]))
      .token;
    await server(`select public.invite_accept($1, '2580', 'arun-phone-0001', $2) as r`, [
      t,
      arunUser,
    ]);
    const t0 = Date.parse('2030-05-01T10:00:00Z');
    const MIN = 60_000;
    // [minutes after t0, right PIN?]
    const steps: [number, boolean][] = [
      [0, false],
      [1, false],
      [2, false],
      [3, true], // count resets
      [4, false],
      [5, false],
      [6, false],
      [7, false],
      [8, false], // 5th → wait 15
      [10, true], // still waiting
      [23, false],
      [24, false],
      [25, false],
      [26, false],
      [27, false], // 10th → locked
      [40, true], // locked
    ];
    let state: PinState = { failedAttempts: 0, waitUntil: null, locked: false };
    for (const [m, right] of steps) {
      const now = t0 + m * MIN;
      const expected = evaluatePinAttempt({
        now,
        correct: right,
        state,
        settings: DEFAULT_STAFF_LOGIN,
      });
      const got = (
        await db.query<{ r: R }>(
          `select private.pin_login_at($1, $2, 'arun-phone-0001', $3::timestamptz) as r`,
          [arunP, right ? '2580' : '0000', new Date(now).toISOString()],
        )
      ).rows[0]!.r;
      const label = `minute ${m}`;
      expect({ label, ok: got.ok }).toEqual({ label, ok: expected.ok });
      if (!expected.ok) {
        expect({ label, reason: got.reason }).toEqual({ label, reason: expected.reason });
        if (expected.reason === 'wait')
          expect({ label, at: Date.parse(got.retryAt!) }).toEqual({ label, at: expected.retryAt });
        if (expected.reason === 'wrong_pin')
          expect({ label, left: got.triesLeft }).toEqual({ label, left: expected.triesLeft });
      }
      state = expected.state;
    }
  });
});
