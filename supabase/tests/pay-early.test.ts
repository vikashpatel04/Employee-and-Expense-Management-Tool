import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Paying salary early (20261109000001). Asha owns Shop 1 and Shop 2. Ravi: Shop 1 custom role with
 * salary.view and salary.run. Sita: Shop 1 custom role with salary.view only. Meena: Shop 1 staff
 * (login), pay day 16. Kiran: Shop 2 staff (login). Dates follow today (IST), so the tests don't
 * age. Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, sita: string, meena: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string;

const DAY = 86_400_000;
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const today = istToday();
const yesterday = shift(today, -1);
const tomorrow = shift(today, 1);
// The run is named after the month of yesterday, so a new cycle from today closes inside it.
const runYear = Number(yesterday.slice(0, 4));
const runMonth = Number(yesterday.slice(5, 7));

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const draft = async (
  shop: string,
  staff: string,
  from: string,
  to: string,
  cycle: string | null,
) => {
  const run =
    (
      await q<{ id: string }>(
        asha,
        `select id from salary_runs where shop_id = $1 and year = $2 and month = $3`,
        [shop, runYear, runMonth],
      )
    )[0]?.id ??
    (
      await q<{ id: string }>(
        asha,
        `insert into salary_runs (shop_id, year, month) values ($1, $2, $3) returning id`,
        [shop, runYear, runMonth],
      )
    )[0]!.id;
  return (
    await q<{ id: string }>(
      asha,
      `insert into payslips (shop_id, run_id, staff_id, lines, gross_paise, net_before_advance_paise,
         net_pay_paise, period_from, period_to, new_cycle_from)
       values ($1, $2, $3, $4, 1112900, 1112900, 1112900, $5, $6, $7) returning id`,
      [shop, run, staff, JSON.stringify([{ kind: 'earned', amount: 1_112_900 }]), from, to, cycle],
    )
  )[0]!.id;
};

const pay = (
  user: string,
  shop: string,
  staff: string,
  slip: string,
  amount: number,
  date = today,
) =>
  q(
    user,
    `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id)
     values ($1, $2, $3, 'salary_payment', $4, 'cash', 'payslips', $5)`,
    [shop, staff, date, -amount, slip],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, sita, meena, kiran] = (await Promise.all(
    ['asha', 'ravi', 'sita', 'meena', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
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
    const staff = async (shop: string, id: string) => {
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-16')`,
        [shop, id],
      );
      await tx.query(
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise,
           pay_rules_override)
         values ($1, $2, '2026-01-16', 'monthly', 1500000, '{"unmarkedDay": "paid"}')`,
        [shop, id],
      );
    };
    meenaP = await person(shop1, meena, 'Meena');
    await staff(shop1, meenaP);
    kiranP = await person(shop2, kiran, 'Kiran');
    await staff(shop2, kiranP);
    const role = async (name: string, keys: string[], who: string) => {
      const id = (
        await tx.query<{ id: string }>(
          `insert into roles (shop_id, name) values ($1, $2) returning id`,
          [shop1, name],
        )
      ).rows[0]!.id;
      for (const key of keys)
        await tx.query(
          'insert into role_permissions (role_id, permission_key, shop_id) values ($1, $2, $3)',
          [id, key, shop1],
        );
      await tx.query(`insert into person_roles (shop_id, person_id, role_id) values ($1, $2, $3)`, [
        shop1,
        who,
        id,
      ]);
    };
    await role('Accounts', ['salary.view', 'salary.run'], await person(shop1, ravi, 'Ravi'));
    await role('Viewer', ['salary.view'], await person(shop1, sita, 'Sita'));
  });
});

describe('paid on', () => {
  let slip: string;
  beforeAll(async () => {
    slip = await draft(shop1, meenaP, shift(today, -20), yesterday, null);
  });

  it('a payment can be dated earlier, never after today', async () => {
    await rejects(pay(ravi, shop1, meenaP, slip, 1000, tomorrow), /dated after today/);
    await pay(ravi, shop1, meenaP, slip, 1000, yesterday);
    expect(
      await q(
        asha,
        `select to_char(date, 'YYYY-MM-DD') as d from ledger_entries where ref_id = $1`,
        [slip],
      ),
    ).toEqual([{ d: yesterday }]);
  });
});

describe('keep the pay day: paying a salary not finalized yet', () => {
  let slip: string;
  beforeAll(async () => {
    slip = (
      await q<{ id: string }>(asha, `select id from payslips where staff_id = $1`, [meenaP])
    )[0]!.id;
  });

  it('salary.run can pay a draft, any amount (it comes off at finalizing)', async () => {
    await pay(ravi, shop1, meenaP, slip, 5_000_000);
  });

  it('salary.view alone, the staff member and another shop can’t', async () => {
    await rejects(pay(sita, shop1, meenaP, slip, 1000), /row-level security/);
    await rejects(pay(meena, shop1, meenaP, slip, 1000), /row-level security/);
    const other = await draft(shop2, kiranP, shift(today, -20), yesterday, null);
    await rejects(pay(ravi, shop2, kiranP, other, 1000), /row-level security/);
    await rejects(pay(ravi, shop1, meenaP, other, 1000), /must match its payslip/);
  });

  it('a draft that has payments can’t be deleted', async () => {
    await rejects(q(ravi, `delete from payslips where id = $1`, [slip]), /paid already/);
  });

  it('a draft can still be updated until it is finalized', async () => {
    await q(ravi, `update payslips set warnings = '[]' where id = $1`, [slip]);
  });
});

describe('new cycle', () => {
  let slip: string;

  it('the new start must be the day after the salary closes', async () => {
    await rejects(
      draft(shop1, meenaP, shift(today, -20), shift(today, -3), today),
      /payslips_new_cycle_after_period|Finalize or delete the current draft/,
    );
    await rejects(
      q(ravi, `update payslips set new_cycle_from = $2 where staff_id = $1`, [meenaP, tomorrow]),
      /payslips_new_cycle_after_period/,
    );
  });

  it('a payslip that doesn’t start a new cycle can’t be finalized as one', async () => {
    slip = (
      await q<{ id: string }>(asha, `select id from payslips where staff_id = $1`, [meenaP])
    )[0]!.id;
    await rejects(
      q(ravi, 'select public.finalize_new_cycle($1)', [slip]),
      /doesn't start a new cycle/,
    );
  });

  it('salary.view alone and another shop can’t start one', async () => {
    await q(ravi, `update payslips set new_cycle_from = $2 where id = $1`, [slip, today]);
    await rejects(q(sita, 'select public.finalize_new_cycle($1)', [slip]), /not found/);
    await rejects(q(meena, 'select public.finalize_new_cycle($1)', [slip]), /not found/);
    const other = (
      await q<{ id: string }>(asha, `select id from payslips where staff_id = $1`, [kiranP])
    )[0]!.id;
    await q(asha, `update payslips set new_cycle_from = $2 where id = $1`, [other, today]);
    await rejects(q(ravi, 'select public.finalize_new_cycle($1)', [other]), /not found/);
  });

  it('finalizes the salary and moves the pay day to the date paid', async () => {
    await q(ravi, 'select public.finalize_new_cycle($1)', [slip]);
    expect(await q(asha, `select status from payslips where id = $1`, [slip])).toEqual([
      { status: 'finalized' },
    ]);
    expect(
      await q(
        asha,
        `select to_char(date, 'YYYY-MM-DD') as d from ledger_entries
         where ref_id = $1 and type = 'salary_earned'`,
        [slip],
      ),
    ).toEqual([{ d: yesterday }]);
    expect(
      await q(
        asha,
        `select to_char(effective_from, 'YYYY-MM-DD') as f, pay_rules_override as o,
           monthly_salary_paise::int as m
         from pay_settings where staff_id = $1 order by effective_from`,
        [meenaP],
      ),
    ).toEqual([
      { f: '2026-01-16', o: { unmarkedDay: 'paid' }, m: 1_500_000 },
      {
        f: today,
        o: { unmarkedDay: 'paid', payDay: { mode: 'fixed', day: Number(today.slice(8, 10)) } },
        m: 1_500_000,
      },
    ]);
  });

  it('once finalized, the paid-early limit applies again', async () => {
    await rejects(pay(ravi, shop1, meenaP, slip, 1), /more than the payslip's net pay/);
  });

  it('a later pay setting gets the new pay day too', async () => {
    const id = (
      await q<{ id: string }>(
        asha,
        `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise)
         values ($1, $2, $3, 'monthly', 1600000) returning id`,
        [shop2, kiranP, shift(today, 10)],
      )
    )[0]!.id;
    const other = (
      await q<{ id: string }>(asha, `select id from payslips where staff_id = $1`, [kiranP])
    )[0]!.id;
    await q(asha, 'select public.finalize_new_cycle($1)', [other]);
    expect(
      await q(asha, `select pay_rules_override as o from pay_settings where id = $1`, [id]),
    ).toEqual([{ o: { payDay: { mode: 'fixed', day: Number(today.slice(8, 10)) } } }]);
  });

  it('can’t start in the future or before the month it is named after', async () => {
    const late = (
      await q<{ id: string }>(asha, `select public.create_shop('Third', 'Asha') as id`)
    )[0]!.id;
    const p = (
      await q<{ id: string }>(
        asha,
        'insert into people (shop_id, name) values ($1, $2) returning id',
        [late, 'Devi'],
      )
    )[0]!.id;
    await q(
      asha,
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-16')`,
      [late, p],
    );
    const early = await draft(late, p, shift(today, -60), shift(today, -45), shift(today, -44));
    await rejects(q(asha, 'select public.finalize_new_cycle($1)', [early]), /named after/);
  });
});

describe('a salary paid up to today (20261109000002)', () => {
  it('starts the new cycle tomorrow, and can’t pay up to a later day', async () => {
    const shop = (
      await q<{ id: string }>(asha, `select public.create_shop('Fourth', 'Asha') as id`)
    )[0]!.id;
    const p = (
      await q<{ id: string }>(
        asha,
        'insert into people (shop_id, name) values ($1, $2) returning id',
        [shop, 'Lakshmi'],
      )
    )[0]!.id;
    await q(
      asha,
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-16')`,
      [shop, p],
    );
    await q(
      asha,
      `insert into pay_settings (shop_id, staff_id, effective_from, pay_type, monthly_salary_paise)
       values ($1, $2, '2026-01-16', 'monthly', 800000)`,
      [shop, p],
    );
    const later = await draft(shop, p, shift(today, -20), tomorrow, shift(today, 2));
    await rejects(q(asha, 'select public.finalize_new_cycle($1)', [later]), /after today/);
    await q(asha, `delete from payslips where id = $1`, [later]);
    const upToToday = await draft(shop, p, shift(today, -20), today, tomorrow);
    await q(asha, 'select public.finalize_new_cycle($1)', [upToToday]);
    expect(
      await q(
        asha,
        `select to_char(effective_from, 'YYYY-MM-DD') as f, pay_rules_override as o
         from pay_settings where staff_id = $1 order by effective_from`,
        [p],
      ),
    ).toEqual([
      { f: '2026-01-16', o: {} },
      { f: tomorrow, o: { payDay: { mode: 'fixed', day: Number(tomorrow.slice(8, 10)) } } },
    ]);
  });
});
