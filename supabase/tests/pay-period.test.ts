import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * The days a payslip covers (20261105000001). Asha owns Shop 1 and Shop 2. Ravi: Shop 1 custom role
 * with salary.run. Meena: Shop 1 staff (login), pay day 16. Kiran: Shop 2 staff (login).
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, meena: string, kiran: string;
let shop1: string;
let meenaP: string;
let oct: string, nov: string, slip: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const run = async (month: number) =>
  (
    await q<{ id: string }>(
      ravi,
      `insert into salary_runs (shop_id, year, month) values ($1, 2026, $2) returning id`,
      [shop1, month],
    )
  )[0]!.id;

const draft = async (runId: string, from: string | null, to: string | null) =>
  (
    await q<{ id: string }>(
      ravi,
      `insert into payslips (shop_id, run_id, staff_id, lines, gross_paise,
         net_before_advance_paise, net_pay_paise, period_from, period_to)
       values ($1, $2, $3, $4, 1500000, 1500000, 1500000, $5, $6) returning id`,
      [shop1, runId, meenaP, JSON.stringify([{ kind: 'earned', amount: 1_500_000 }]), from, to],
    )
  )[0]!.id;

const ledgerDates = (slipId: string) =>
  q<{ date: string }>(
    asha,
    `select to_char(date, 'YYYY-MM-DD') as date from ledger_entries where ref_id = $1`,
    [slipId],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, meena, kiran] = (await Promise.all(
    ['asha', 'ravi', 'meena', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string, string];
  shop1 = (
    await q<{ id: string }>(asha, `select public.create_shop('Main Road', 'Asha') as id`)
  )[0]!.id;
  const shop2 = (
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
    meenaP = await person(shop1, meena, 'Meena');
    const kiranP = await person(shop2, kiran, 'Kiran');
    await tx.query(
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-09-16')`,
      [shop1, meenaP],
    );
    await tx.query(
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-09-16')`,
      [shop2, kiranP],
    );
    const raviP = await person(shop1, ravi, 'Ravi');
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Accounts') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    for (const key of ['salary.view', 'salary.run'])
      await tx.query(
        'insert into role_permissions (role_id, permission_key, shop_id) values ($1, $2, $3)',
        [role, key, shop1],
      );
    await tx.query(`insert into person_roles (shop_id, person_id, role_id) values ($1, $2, $3)`, [
      shop1,
      raviP,
      role,
    ]);
  });
  oct = await run(10);
  nov = await run(11);
});

describe('payslip period', () => {
  it('needs both dates, in order', async () => {
    await rejects(draft(oct, '2026-09-16', null), /payslips_period_both/);
    await rejects(draft(oct, '2026-10-15', '2026-09-16'), /payslips_period_order/);
  });

  it('a draft’s days can change until it is finalized', async () => {
    slip = await draft(oct, '2026-09-01', '2026-09-30');
    await q(
      ravi,
      `update payslips set period_from = '2026-09-16', period_to = '2026-10-15'
      where id = $1`,
      [slip],
    );
    expect(
      await q(
        ravi,
        `select to_char(period_from, 'YYYY-MM-DD') as f, to_char(period_to, 'YYYY-MM-DD') as t
         from payslips where id = $1`,
        [slip],
      ),
    ).toEqual([{ f: '2026-09-16', t: '2026-10-15' }]);
  });

  it('finalizing dates the ledger lines on the period’s last day, not the month end', async () => {
    await q(ravi, 'select public.finalize_payslip($1)', [slip]);
    expect(await ledgerDates(slip)).toEqual([{ date: '2026-10-15' }]);
  });

  it('a finalized payslip’s days can’t change, and the staff member can read them', async () => {
    await rejects(
      q(ravi, `update payslips set period_to = '2026-10-20' where id = $1`, [slip]),
      /finalized payslip/,
    );
    expect(
      await q(meena, `select to_char(period_to, 'YYYY-MM-DD') as t from payslips where id = $1`, [
        slip,
      ]),
    ).toEqual([{ t: '2026-10-15' }]);
  });

  it('another shop’s staff don’t see it', async () => {
    expect(await q(kiran, 'select 1 from payslips')).toHaveLength(0);
  });

  it('a payslip with no dates keeps the calendar month end (older apps)', async () => {
    const old = await draft(nov, null, null);
    await q(ravi, 'select public.finalize_payslip($1)', [old]);
    expect(await ledgerDates(old)).toEqual([{ date: '2026-11-30' }]);
  });
});
