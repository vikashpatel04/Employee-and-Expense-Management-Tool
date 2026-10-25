import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_STAFF_LOGIN, evaluatePinAttempt, phoneKey, type PinState } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Staffora sign-in: phone number + PIN (migrations 20261024000005, 20261025000001-2).
 *   Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Manager" role: staff.edit (not staff, so no Staffora).
 *   Meena: Shop 1 staff, phone "98765 43210", no PIN yet (sets it the first time).
 *   Selvi: Shop 1 staff who left.
 *   Arun:  Shop 1 staff for the core-parity scenario.
 *   Banu:  Shop 1 and Shop 2 staff with the same phone (ambiguous).
 *   Kiran: Shop 2 staff with a sign-in (other shop).
 * The edge function's calls are made as service_role. Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, kiran: string, meenaUser: string, arunUser: string;
let shop1: string, shop2: string;
let ashaP: string, meenaP: string, selviP: string, arunP: string;

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
    const person = async (
      s: string,
      user: string | null,
      name: string,
      staff: boolean,
      phone: string | null = null,
    ) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name, phone) values ($1, $2, $3, $4) returning id',
          [s, user, name, phone],
        )
      ).rows[0]!.id;
      if (staff)
        await tx.query(
          `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
          [s, id],
        );
      return id;
    };
    const raviP = await person(shop1, ravi, 'Ravi', false, '9000000005');
    meenaP = await person(shop1, null, 'Meena Kumari', true, '98765 43210');
    selviP = await person(shop1, null, 'Selvi', true, '9000000002');
    arunP = await person(shop1, null, 'Arun', true, '9000000003');
    await person(shop1, null, 'Banu', true, '9000000006');
    await person(shop2, null, 'Banu', true, '+91 90000 00006');
    await person(shop2, kiran, 'Kiran', true, '9000000004');
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

describe('phone sign-in (migration 20261025000002)', () => {
  const lookup = (phone: string) => server<R>('select public.phone_lookup($1) as r', [phone]);
  const setup = (phone: string, pin: string, device = PHONE, user = meenaUser) =>
    server<R>('select public.pin_setup($1, $2, $3, $4) as r', [phone, pin, device, user]);

  it('the server finds the staff member by phone number, however it is typed', async () => {
    const meena = {
      ok: true,
      personId: meenaP,
      shopId: shop1,
      firstName: 'Meena',
      shopName: 'Main Road',
      hasPin: false,
      authUserId: null,
    };
    expect(await lookup('9876543210')).toEqual(meena);
    expect(await lookup('+91 98765-43210')).toEqual(meena);
    expect(await lookup('098765 43210')).toEqual(meena);
  });

  it('unknown numbers, non-staff, people who left and shared numbers are refused', async () => {
    expect(await lookup('9999999999')).toEqual({ ok: false, reason: 'not_found' });
    expect(await lookup('12345')).toEqual({ ok: false, reason: 'not_found' });
    expect(await lookup('9000000005')).toEqual({ ok: false, reason: 'not_found' }); // Ravi
    expect(await lookup('9000000002')).toEqual({ ok: false, reason: 'left' });
    expect(await lookup('9000000006')).toEqual({ ok: false, reason: 'many' });
  });

  it('apps cannot call the server-only functions; nobody reads PINs', async () => {
    for (const user of [null, asha]) {
      await rejects(q(user, 'select public.phone_lookup($1)', ['9876543210']), /permission denied/);
      await rejects(
        q(user, `select public.pin_setup($1, '1234', $2, $3)`, ['9876543210', PHONE, meenaUser]),
        /permission denied/,
      );
      await rejects(
        q(user, `select public.pin_login($1, '1234', $2)`, [meenaP, PHONE]),
        /permission denied/,
      );
    }
    await rejects(q(asha, 'select * from pin_credentials'), /permission denied/);
  });

  it('the first PIN must be 4 digits', async () => {
    expect(await setup('9876543210', '12a4')).toEqual({ ok: false, reason: 'bad_pin' });
  });

  it('setting the first PIN links the sign-in, saves the PIN and binds the phone', async () => {
    expect(await setup('+91 98765 43210', '4321')).toEqual({
      ok: true,
      personId: meenaP,
      shopId: shop1,
    });
    const p = await db.query<{ auth_user_id: string; device_id: string; pin_hash: string }>(
      `select p.auth_user_id, s.device_id, c.pin_hash from people p
       join staff s on s.person_id = p.id join pin_credentials c on c.person_id = p.id
       where p.id = $1`,
      [meenaP],
    );
    expect(p.rows[0]).toMatchObject({ auth_user_id: meenaUser, device_id: PHONE });
    expect(p.rows[0]!.pin_hash).not.toContain('4321');
    expect(await lookup('9876543210')).toMatchObject({ hasPin: true, authUserId: meenaUser });
  });

  it('once a PIN is set, setting it again is refused (sign in instead)', async () => {
    expect(await setup('9876543210', '1111')).toEqual({ ok: false, reason: 'has_pin' });
  });

  it('the invite links are gone', async () => {
    const r = await db.query(
      `select 1 from pg_proc where proname in ('create_invite', 'invite_accept', 'invite_lookup')
       union all select 1 from pg_class where relname = 'invites'`,
    );
    expect(r.rows).toEqual([]);
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

describe('change PIN (migration 20261025000001)', () => {
  const PHONE2 = 'new-phone-00001'; // Meena's phone after the reset above
  const change = (user: string | null, current: string, next: string, device = PHONE2) =>
    one<R>(user, 'select public.change_pin($1, $2, $3, $4) as r', [meenaP, current, next, device]);
  const login = (pin: string) =>
    server<R>('select public.pin_login($1, $2, $3) as r', [meenaP, pin, PHONE2]);

  it('the new PIN must be 4 digits (nothing counted)', async () => {
    expect(await change(meenaUser, '4321', '12a4')).toEqual({ ok: false, reason: 'bad_pin' });
    expect(await change(meenaUser, '4321', '12345')).toEqual({ ok: false, reason: 'bad_pin' });
  });

  it('a wrong current PIN counts like a wrong sign-in', async () => {
    expect(await change(meenaUser, '0000', '5678')).toEqual({
      ok: false,
      reason: 'wrong_pin',
      triesLeft: 4,
    });
    expect(await change(meenaUser, '4321', '5678', 'stolen-phone-0001')).toEqual({
      ok: false,
      reason: 'wrong_device',
    });
  });

  it('the new PIN must differ from the current one', async () => {
    expect(await change(meenaUser, '4321', '4321')).toEqual({ ok: false, reason: 'same_pin' });
  });

  it('the right current PIN sets the new one; the old one stops working', async () => {
    expect(await change(meenaUser, '4321', '5678')).toEqual({ ok: true });
    expect(await login('5678')).toMatchObject({ ok: true });
    expect(await login('4321')).toMatchObject({ ok: false, reason: 'wrong_pin' });
    expect(await change(meenaUser, '5678', '4321')).toEqual({ ok: true });
    expect(await login('4321')).toMatchObject({ ok: true });
  });

  it('only for your own sign-in', async () => {
    await rejects(change(kiran, '4321', '5678'), /Not allowed/);
    await rejects(change(asha, '4321', '5678'), /Not allowed/);
    await rejects(change(null, '4321', '5678'), /permission denied/);
  });
});

describe('the database reads phone numbers like core (phoneKey)', () => {
  it('gives the same key for each way of writing a number', async () => {
    for (const typed of [
      '9876543210',
      '+91 98765 43210',
      '0091 98765 43210',
      '09876543210',
      '12345',
      '+44 7700 900123',
      '',
    ]) {
      const r = await db.query<{ k: string | null }>('select private.phone_key($1) as k', [typed]);
      expect({ typed, key: r.rows[0]!.k }).toEqual({ typed, key: phoneKey(typed) });
    }
  });
});

describe('reset a forgotten PIN (migration 20261025000002)', () => {
  const PHONE2 = 'new-phone-00001';
  const login = (pin: string) =>
    server<R>('select public.pin_login($1, $2, $3) as r', [meenaP, pin, PHONE2]);
  const setup = (pin: string, device: string) =>
    server<R>('select public.pin_setup($1, $2, $3, $4) as r', [
      '9876543210',
      pin,
      device,
      meenaUser,
    ]);

  it('staff.edit resets it; the staff member sets a new one on their own phone', async () => {
    await q(ravi, 'select public.reset_pin($1)', [meenaP]);
    expect(await login('4321')).toEqual({ ok: false, reason: 'no_pin' });
    expect(await server<R>('select public.phone_lookup($1) as r', ['9876543210'])).toMatchObject({
      hasPin: false,
    });
    expect(await setup('2468', 'stolen-phone-0001')).toEqual({
      ok: false,
      reason: 'wrong_device',
    });
    expect(await setup('2468', PHONE2)).toMatchObject({ ok: true });
    expect(await login('2468')).toMatchObject({ ok: true });
  });

  it('not for other shops or without staff.edit', async () => {
    await rejects(q(kiran, 'select public.reset_pin($1)', [meenaP]), /Not allowed/);
    await rejects(q(null, 'select public.reset_pin($1)', [meenaP]), /permission denied/);
  });
});

describe('the database follows the core rules (evaluatePinAttempt)', () => {
  it('gives the same result as core for a run of attempts', async () => {
    await server(`select public.pin_setup('9000000003', '2580', 'arun-phone-0001', $1) as r`, [
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
