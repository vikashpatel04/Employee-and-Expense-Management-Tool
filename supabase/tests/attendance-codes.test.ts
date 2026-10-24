import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CODE_SETTINGS, evaluateCheck, type CheckAttempt } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Attendance codes and check-in (migration 20261024000003).
 *   Asha owns Shop 1, Shop 2 and Shop 3.
 *   Ravi:  Shop 1 "Supervisor" role: attendance.code.
 *   Meena: Shop 1 staff with a login, self attendance on.
 *   Selvi: Shop 1 staff with a login, self attendance off.
 *   Kiran: Shop 2 staff with a login, self attendance on.
 *   Arun:  Shop 3 staff (no login): the core-parity scenario runs as the server.
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, meena: string, selvi: string, kiran: string;
let shop1: string, shop2: string, shop3: string;
let meenaP: string, selviP: string, kiranP: string, arunP: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const one = async <T>(user: string | null, sql: string, params: unknown[] = []) =>
  (await q<{ r: T }>(user, sql, params))[0]!.r;

const PHONE = 'meena-phone-0001';
type CodeInfo = { code: string; validFrom: string; nextChange: string | null };

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, meena, selvi, kiran] = (await Promise.all(
    ['asha', 'ravi', 'meena', 'selvi', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string, string, string];
  const shop = async (name: string) =>
    (await q<{ id: string }>(asha, `select public.create_shop($1, 'Asha') as id`, [name]))[0]!.id;
  shop1 = await shop('Main Road');
  shop2 = await shop('Market');
  shop3 = await shop('Parity');

  await as(db, asha, async (tx) => {
    const person = async (s: string, user: string | null, name: string, self: boolean) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [s, user, name],
        )
      ).rows[0]!.id;
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date, self_attendance)
         values ($1, $2, '2026-01-01', $3)`,
        [s, id, self],
      );
      return id;
    };
    const raviP = (
      await tx.query<{ id: string }>(
        `insert into people (shop_id, auth_user_id, name) values ($1, $2, 'Ravi') returning id`,
        [shop1, ravi],
      )
    ).rows[0]!.id;
    meenaP = await person(shop1, meena, 'Meena', true);
    selviP = await person(shop1, selvi, 'Selvi', false);
    kiranP = await person(shop2, kiran, 'Kiran', true);
    arunP = await person(shop3, null, 'Arun', true);
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Supervisor') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id) values ($1, 'attendance.code', $2)`,
      [role, shop1],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      raviP,
      role,
      shop1,
    ]);
  });
});

describe('the attendance code', () => {
  it('nobody reads the codes table directly', async () => {
    for (const user of [asha, ravi, meena]) {
      await rejects(q(user, 'select * from attendance_codes'), /permission denied/);
    }
    await rejects(q(null, 'select * from attendance_codes'), /permission denied/);
  });

  it('the owner and people with attendance.code see the same 6-digit code', async () => {
    const a = await one<CodeInfo>(asha, 'select public.attendance_code($1) as r', [shop1]);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(a.nextChange).not.toBeNull(); // daily by default
    const b = await one<CodeInfo>(ravi, 'select public.attendance_code($1) as r', [shop1]);
    expect(b.code).toBe(a.code);
  });

  it('staff and other shops cannot see it', async () => {
    await rejects(q(meena, 'select public.attendance_code($1)', [shop1]), /Not allowed/);
    await rejects(q(ravi, 'select public.attendance_code($1)', [shop2]), /Not allowed/);
    await rejects(q(kiran, 'select public.attendance_code($1)', [shop1]), /Not allowed/);
    await rejects(q(null, 'select public.attendance_code($1)', [shop1]), /permission denied/);
  });

  it('regenerating gives a different code that becomes the current one', async () => {
    const before = await one<CodeInfo>(asha, 'select public.attendance_code($1) as r', [shop1]);
    const after = await one<CodeInfo>(ravi, 'select public.regenerate_attendance_code($1) as r', [
      shop1,
    ]);
    expect(after.code).not.toBe(before.code);
    expect(
      (await one<CodeInfo>(asha, 'select public.attendance_code($1) as r', [shop1])).code,
    ).toBe(after.code);
    await rejects(q(meena, 'select public.regenerate_attendance_code($1)', [shop1]), /Not allowed/);
  });

  it('changes once a day at the chosen time (IST), or only by hand in manual mode', async () => {
    const at = async (shop: string, iso: string) =>
      (
        await db.query<{ code: string }>(
          'select code from private.current_code($1, $2::timestamptz, null)',
          [shop, iso],
        )
      ).rows[0]!.code;
    await db.query(
      `update shops set settings = '{"attendanceCode":{"rotation":{"mode":"daily","atMinutes":600}}}'
       where id = $1`,
      [shop2],
    );
    const morning = await at(shop2, '2030-01-10T09:00:00+05:30');
    expect(await at(shop2, '2030-01-10T09:59:00+05:30')).toBe(morning);
    const after10 = await at(shop2, '2030-01-10T10:01:00+05:30');
    expect(after10).not.toBe(morning);
    expect(await at(shop2, '2030-01-11T09:59:00+05:30')).toBe(after10);
    expect(await at(shop2, '2030-01-11T10:00:00+05:30')).not.toBe(after10);

    const next = await db.query<{ n: string }>(
      `select private.next_rotation($1, '2030-01-11T12:00:00+05:30')::text as n`,
      [shop2],
    );
    expect(new Date(next.rows[0]!.n).toISOString()).toBe('2030-01-12T04:30:00.000Z');

    await db.query(
      `update shops set settings = '{"attendanceCode":{"rotation":{"mode":"manual"}}}' where id = $1`,
      [shop2],
    );
    const manual = await at(shop2, '2030-01-12T11:00:00+05:30');
    expect(await at(shop2, '2030-01-20T11:00:00+05:30')).toBe(manual);
    const none = await db.query<{ n: string | null }>(
      `select private.next_rotation($1, now()) as n`,
      [shop2],
    );
    expect(none.rows[0]!.n).toBeNull();
  });

  it('the SQL defaults are the core defaults', async () => {
    const r = await db.query<{ s: Record<string, unknown> }>(
      'select private.code_settings($1) as s',
      [shop1],
    );
    const d = DEFAULT_CODE_SETTINGS;
    expect(r.rows[0]!.s).toEqual({
      rotationMode: d.rotation.mode,
      atMinutes: d.rotation.mode === 'daily' ? d.rotation.atMinutes : 0,
      minGapMinutes: d.minGapMinutes,
      cooldownMinutes: d.cooldownMinutes,
      checkOutRequired: d.checkOutRequired,
      maxWrongCodes: d.maxWrongCodes,
      wrongCodeWindowMinutes: d.wrongCodeWindowMinutes,
      lockoutMinutes: d.lockoutMinutes,
    });
  });
});

describe('check in and out', () => {
  type Result = { ok: boolean; kind?: string; reason?: string; retryAt?: string; at: string };
  const checkIn = (user: string | null, shop: string, code: string, device = PHONE) =>
    one<Result>(user, `select public.check_in($1, $2, 'typed', $3) as r`, [shop, code, device]);
  const code1 = async () =>
    (await one<CodeInfo>(asha, 'select public.attendance_code($1) as r', [shop1])).code;

  it('staff check in with the right code; the day becomes present, self, with the time', async () => {
    const r = await checkIn(meena, shop1, await code1());
    expect(r).toMatchObject({ ok: true, kind: 'in' });
    const day = await q<{ status: string; source: string; check_in: unknown }>(
      asha,
      `select status, source, check_in from attendance where staff_id = $1`,
      [meenaP],
    );
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ status: 'present', source: 'self' });
    expect(day[0]!.check_in).not.toBeNull();
  });

  it('binds the first phone; another phone is refused', async () => {
    const bound = await q<{ device_id: string }>(
      asha,
      'select device_id from staff where person_id = $1',
      [meenaP],
    );
    expect(bound[0]!.device_id).toBe(PHONE);
    const r = await checkIn(meena, shop1, await code1(), 'someone-elses-phone');
    expect(r).toMatchObject({ ok: false, reason: 'wrong_device' });
  });

  it('a second tap right away is the cooldown', async () => {
    const r = await checkIn(meena, shop1, await code1());
    expect(r).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(r.retryAt).toBeDefined();
  });

  it('refuses staff with self attendance off, other shops, non-staff and anon', async () => {
    expect(await checkIn(selvi, shop1, await code1(), 'selvi-phone-0001')).toMatchObject({
      ok: false,
      reason: 'self_off',
    });
    expect(await checkIn(kiran, shop1, await code1(), 'kiran-phone-0001')).toMatchObject({
      ok: false,
      reason: 'not_staff',
    });
    expect(await checkIn(ravi, shop1, await code1(), 'ravi-phone-00001')).toMatchObject({
      ok: false,
      reason: 'not_staff',
    });
    await rejects(checkIn(null, shop1, '123456'), /permission denied/);
  });

  it('needs a method and a device id', async () => {
    await rejects(
      q(meena, `select public.check_in($1, '123456', 'shouted', $2)`, [shop1, PHONE]),
      /Method must be scan or typed/,
    );
    await rejects(
      q(meena, `select public.check_in($1, '123456', 'scan', 'x')`, [shop1]),
      /device id is required/,
    );
  });

  it('every attempt is recorded; people see their own, the code screen sees the shop', async () => {
    const mine = await q<{ result: string }>(
      meena,
      'select result from attendance_scans order by at',
    );
    expect(mine.map((x) => x.result)).toEqual(['accepted', 'wrong_device', 'cooldown']);
    const shop = await q<{ staff_id: string }>(ravi, 'select staff_id from attendance_scans');
    expect(new Set(shop.map((x) => x.staff_id))).toEqual(new Set([meenaP, selviP]));
    expect(await q(kiran, 'select * from attendance_scans where shop_id = $1', [shop1])).toEqual(
      [],
    );
  });

  it('attempts cannot be added, changed or removed directly', async () => {
    await rejects(
      q(
        meena,
        `insert into attendance_scans (shop_id, staff_id, method, kind, result)
         values ($1, $2, 'typed', 'in', 'accepted')`,
        [shop1, meenaP],
      ),
      /permission denied/,
    );
    await rejects(q(asha, `update attendance_scans set result = 'accepted'`), /permission denied/);
    await rejects(q(asha, 'delete from attendance_scans'), /permission denied/);
  });
});

describe('the database follows the core rules (evaluateCheck)', () => {
  it('gives the same result as core for a day of attempts', async () => {
    const t0 = Date.parse('2030-03-05T09:30:00+05:30');
    const MIN = 60_000;
    const code = (
      await db.query<{ code: string }>(
        'select code from private.current_code($1, $2::timestamptz, null)',
        [shop3, new Date(t0 - MIN).toISOString()],
      )
    ).rows[0]!.code;
    const wrong = code === '000000' ? '000001' : '000000';
    // [minutes after t0, right code?]
    const steps: [number, boolean][] = [
      [0, true], // in
      [1, true], // cooldown
      [5, true], // too soon (min gap 30)
      [6, false],
      [7, false],
      [8, false],
      [9, false],
      [10, false], // fifth wrong in 10 minutes
      [11, true], // locked until 20
      [21, true], // too soon still (gap ends at 30)
      [31, true], // out
      [40, true], // already checked out
    ];
    const attempts: CheckAttempt[] = [];
    const today: { checkIn?: number; checkOut?: number } = {};
    for (const [m, right] of steps) {
      const now = t0 + m * MIN;
      const expected = evaluateCheck({
        now,
        codeMatches: right,
        attempts,
        today,
        settings: DEFAULT_CODE_SETTINGS,
      });
      const got = (
        await db.query<{ r: { ok: boolean; kind?: string; reason?: string; retryAt?: string } }>(
          `select private.check_in_at($1, $2, $3, 'scan', 'arun-phone-0001', $4::timestamptz) as r`,
          [shop3, arunP, right ? code : wrong, new Date(now).toISOString()],
        )
      ).rows[0]!.r;
      const label = `minute ${m}`;
      expect({ label, ok: got.ok }).toEqual({ label, ok: expected.ok });
      if (expected.ok) {
        expect({ label, kind: got.kind }).toEqual({ label, kind: expected.kind });
        if (expected.kind === 'in') today.checkIn = now;
        else today.checkOut = now;
        attempts.push({ at: now, result: 'accepted' });
      } else {
        expect({ label, reason: got.reason }).toEqual({ label, reason: expected.reason });
        if ('retryAt' in expected)
          expect({ label, retry: Date.parse(got.retryAt!) }).toEqual({
            label,
            retry: expected.retryAt,
          });
        attempts.push({ at: now, result: expected.reason });
      }
    }
    const day = (
      await db.query<{ check_in: Date; check_out: Date }>(
        'select check_in, check_out from attendance where staff_id = $1',
        [arunP],
      )
    ).rows[0]!;
    expect(day.check_in.getTime()).toBe(t0);
    expect(day.check_out.getTime()).toBe(t0 + 31 * MIN);
  });
});
