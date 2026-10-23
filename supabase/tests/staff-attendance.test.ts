import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, businessDateOf } from '@fincrew/core';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 staff + "Supervisor" role (staff.view, attendance.mark; NOT edit_past, NOT pay).
 *   Priya: Shop 1 "Accounts" role (staff.pay.view only), not staff.
 *   Meena: Shop 1 staff, no roles.
 *   Kiran: Shop 2 staff, no roles.
 */
let db: Db;
let asha: string, ravi: string, priya: string, meena: string, kiran: string;
let shop1: string, shop2: string;
let raviP: string, priyaP: string, meenaP: string, kiranP: string;
let template1: string;

const today = businessDateOf(new Date());
const yesterday = addDays(today, -1);

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const affected = (user: string, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query(sql, params)).affectedRows ?? 0);

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, priya, meena, kiran] = (await Promise.all(
    ['asha', 'ravi', 'priya', 'meena', 'kiran'].map((n) => createAuthUser(db, `${n}@shop.test`)),
  )) as [string, string, string, string, string];
  shop1 = (
    await q<{ id: string }>(asha, `select public.create_shop('Main Road', 'Asha') as id`)
  )[0]!.id;
  shop2 = (
    await q<{ id: string }>(asha, `select public.create_shop('Market Branch', 'Asha') as id`)
  )[0]!.id;

  await as(db, asha, async (tx) => {
    const person = async (shop: string, user: string, name: string) =>
      (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [shop, user, name],
        )
      ).rows[0]!.id;
    raviP = await person(shop1, ravi, 'Ravi');
    priyaP = await person(shop1, priya, 'Priya');
    meenaP = await person(shop1, meena, 'Meena');
    kiranP = await person(shop2, kiran, 'Kiran');

    for (const [shop, p] of [
      [shop1, raviP],
      [shop1, meenaP],
      [shop2, kiranP],
    ] as const) {
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
        [shop, p],
      );
    }

    const role = async (name: string, keys: string[], member: string) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into roles (shop_id, name) values ($1, $2) returning id',
          [shop1, name],
        )
      ).rows[0]!.id;
      for (const k of keys) {
        await tx.query(
          'insert into role_permissions (role_id, permission_key, shop_id) values ($1, $2, $3)',
          [id, k, shop1],
        );
      }
      await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
        member,
        id,
        shop1,
      ]);
    };
    await role('Supervisor', ['staff.view', 'attendance.mark'], raviP);
    await role('Accounts', ['staff.pay.view'], priyaP);

    await tx.query(
      `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise, shift_start, shift_end)
       values ($1, $2, '2026-01-01', 'monthly', 3000000, 570, 1230)`,
      [shop1, meenaP],
    );
    template1 = (
      await tx.query<{ id: string }>(
        `insert into leave_templates (shop_id, name) values ($1, 'Standard') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into leave_template_versions (shop_id, template_id, effective_from, weekly_offs, paid_leaves_per_month)
       values ($1, $2, '2026-01-01', '[{"weekday":0,"paid":true}]', 2)`,
      [shop1, template1],
    );
    await tx.query(
      `insert into staff_leave_templates (shop_id, staff_id, template_id, effective_from) values ($1, $2, $3, '2026-01-01')`,
      [shop1, meenaP, template1],
    );
    await tx.query(
      `insert into holidays (shop_id, date, name, paid) values ($1, '2026-11-08', 'Diwali', true)`,
      [shop1],
    );
  });
});

const names = (rows: { name?: unknown }[]) => rows.map((r) => r.name).sort();

describe('staff', () => {
  const staffNames = (user: string) =>
    q<{ name: string }>(user, 'select p.name from staff s join people p on p.id = s.person_id');

  it('owner sees staff in both shops; supervisor only in shop 1', async () => {
    expect(names(await staffNames(asha))).toEqual(['Kiran', 'Meena', 'Ravi']);
    expect(names(await staffNames(ravi))).toEqual(['Meena', 'Ravi']);
  });

  it('staff see only themselves', async () => {
    expect(names(await staffNames(meena))).toEqual(['Meena']);
    expect(names(await staffNames(kiran))).toEqual(['Kiran']);
  });

  it('staff rows are never deleted (people leave with a leaving date)', async () => {
    expect(await affected(asha, 'delete from staff where person_id = $1', [meenaP])).toBe(0);
  });

  it('audit rows name the staff member', async () => {
    const rows = await q<{ row_id: string }>(
      asha,
      `select row_id from audit_log where table_name = 'staff' and shop_id = $1`,
      [shop2],
    );
    expect(rows).toEqual([{ row_id: kiranP }]);
  });
});

describe('cross-shop links are impossible', () => {
  it('pay settings in shop 2 cannot point at shop 1 staff', async () => {
    await rejects(
      q(
        asha,
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, daily_wage_paise) values ($1, $2, '2026-03-01', 'daily', 80000)`,
        [shop2, meenaP],
      ),
      /foreign key/,
    );
  });

  it('attendance in shop 1 cannot point at shop 2 staff', async () => {
    await rejects(
      q(
        asha,
        `insert into attendance (shop_id, staff_id, date, status) values ($1, $2, $3, 'present')`,
        [shop1, kiranP, today],
      ),
      /foreign key/,
    );
  });

  it("a template can't be assigned from another shop", async () => {
    await rejects(
      q(
        asha,
        `insert into staff_leave_templates (shop_id, staff_id, template_id, effective_from) values ($1, $2, $3, '2026-02-01')`,
        [shop2, kiranP, template1],
      ),
      /foreign key/,
    );
  });
});

describe('pay settings', () => {
  const visible = (user: string) => q(user, 'select staff_id from pay_settings');

  it('staff see their own pay; staff.pay.view sees the shop; others nothing', async () => {
    expect(await visible(meena)).toHaveLength(1);
    expect(await visible(priya)).toHaveLength(1);
    expect(await visible(ravi)).toHaveLength(0);
    expect(await visible(kiran)).toHaveLength(0);
  });

  it('viewing pay does not allow editing it', async () => {
    await rejects(
      q(
        priya,
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise) values ($1, $2, '2026-06-01', 'monthly', 3500000)`,
        [shop1, meenaP],
      ),
      /row-level security/,
    );
  });

  it('the database refuses incomplete or impossible settings', async () => {
    await rejects(
      q(
        asha,
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type) values ($1, $2, '2026-07-01', 'monthly')`,
        [shop1, raviP],
      ),
      /check constraint/,
    );
    await rejects(
      q(
        asha,
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, daily_wage_paise, shift_start, shift_end) values ($1, $2, '2026-07-01', 'daily', 80000, 600, 540)`,
        [shop1, raviP],
      ),
      /check constraint/,
    );
  });
});

describe('leave templates and holidays', () => {
  it('everyone in the shop can read them (staff need their weekly offs)', async () => {
    expect(await q(meena, 'select 1 from leave_template_versions')).toHaveLength(1);
    expect(await q(meena, 'select 1 from holidays')).toHaveLength(1);
  });

  it('other shops cannot', async () => {
    expect(await q(kiran, 'select 1 from leave_templates')).toHaveLength(0);
    expect(await q(kiran, 'select 1 from holidays')).toHaveLength(0);
  });

  it('only settings.leave_templates can change them', async () => {
    await rejects(
      q(ravi, `insert into leave_templates (shop_id, name) values ($1, 'Mine')`, [shop1]),
      /row-level security/,
    );
    await rejects(
      q(ravi, `insert into holidays (shop_id, date, name) values ($1, '2026-12-25', 'Xmas')`, [
        shop1,
      ]),
      /row-level security/,
    );
  });

  it('a template version stores the configurable rules with sensible defaults', async () => {
    const [v] = await q<{ carry_over: unknown; sandwich: unknown; accrual: unknown }>(
      asha,
      'select carry_over, sandwich, accrual from leave_template_versions',
    );
    expect(v).toEqual({
      carry_over: { mode: 'lapse' },
      sandwich: { enabled: false, triggers: ['absent'], appliesTo: ['weekly_off'], sides: 'both' },
      accrual: { mode: 'full' },
    });
  });
});

describe('attendance', () => {
  const mark = (user: string, staff: string, date: string, status = 'present', shop = shop1) =>
    q<{ marked_by: string; source: string }>(
      user,
      `insert into attendance (shop_id, staff_id, date, status) values ($1, $2, $3, $4) returning marked_by, source`,
      [shop, staff, date, status],
    );

  it('attendance.mark can mark today, and is recorded as the marker', async () => {
    expect(await mark(ravi, meenaP, today)).toEqual([{ marked_by: raviP, source: 'manual' }]);
  });

  it('one mark per person per day', async () => {
    await rejects(mark(asha, meenaP, today, 'absent'), /duplicate key/);
  });

  it('earlier days need attendance.edit_past', async () => {
    await rejects(mark(ravi, raviP, yesterday), /row-level security/);
    await mark(asha, raviP, yesterday);
    expect(
      await affected(
        ravi,
        `update attendance set status = 'absent' where staff_id = $1 and date = $2`,
        [raviP, yesterday],
      ),
    ).toBe(0);
    expect(
      await affected(
        asha,
        `update attendance set status = 'half_day' where staff_id = $1 and date = $2`,
        [raviP, yesterday],
      ),
    ).toBe(1);
  });

  it('staff cannot mark themselves through the API (self check-in uses the edge function)', async () => {
    await rejects(mark(meena, meenaP, addDays(today, 1)), /row-level security/);
  });

  it('staff read only their own attendance; markers read the shop', async () => {
    expect(await q(meena, 'select 1 from attendance')).toHaveLength(1);
    expect(await q(ravi, 'select 1 from attendance')).toHaveLength(2);
    expect(await q(priya, 'select 1 from attendance')).toHaveLength(0);
  });

  it('attendance.mark in shop 1 cannot mark in shop 2', async () => {
    await rejects(mark(ravi, kiranP, today, 'present', shop2), /row-level security/);
  });

  it('anonymous users get nothing', async () => {
    await rejects(q(null, 'select 1 from attendance'), /permission denied/);
    await rejects(q(null, 'select 1 from staff'), /permission denied/);
  });
});

describe('add_staff', () => {
  const add = (user: string, shop: string, name: string) =>
    q<{ id: string }>(user, `select public.add_staff($1, $2, '98765 43210', '2026-10-01') as id`, [
      shop,
      name,
    ]);

  it('creates the person and the staff row together', async () => {
    const [row] = await add(asha, shop1, '  Selvi Murugan ');
    const rows = await q<{ name: string; phone: string; joining: string }>(
      asha,
      `select p.name, p.phone, to_char(s.joining_date, 'YYYY-MM-DD') as joining
       from staff s join people p on p.id = s.person_id where s.person_id = $1`,
      [row!.id],
    );
    expect(rows).toEqual([{ name: 'Selvi Murugan', phone: '98765 43210', joining: '2026-10-01' }]);
  });

  it('needs staff.edit in that shop, and leaves nothing behind when refused', async () => {
    await rejects(add(ravi, shop1, 'Ghost'), /row-level security/);
    await rejects(add(asha, shop1, '   '), /check constraint/);
    expect(await q(asha, `select 1 from people where name in ('Ghost', '')`)).toHaveLength(0);
  });

  it("can't add staff to a shop you don't manage", async () => {
    await rejects(add(kiran, shop1, 'Intruder'), /row-level security/);
  });
});
