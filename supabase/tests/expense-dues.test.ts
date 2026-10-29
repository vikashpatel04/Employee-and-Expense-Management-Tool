import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Advance cut mode and expenses settled through salary (20261029000001).
 * Asha owns Shop 1 and Shop 2. Meena: Shop 1 staff (login). Kiran: Shop 2 staff (login).
 * Tests run in order.
 */
let db: Db;
let asha: string, meena: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string;
let cat: string, runId: string, slip: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const n = (v: unknown) => Number(v);

const dues = async (user: string, staff: string) => {
  const r = (
    await q<{ payback_paise: unknown; charge_paise: unknown }>(
      user,
      'select payback_paise, charge_paise from expense_balances where staff_id = $1',
      [staff],
    )
  )[0];
  return r ? { payback: n(r.payback_paise), charges: n(r.charge_paise) } : null;
};

const draft = (t: { gross: number; payback: number; cut: number; expenseCut: number; net?: number }) =>
  q<{ id: string }>(
    asha,
    `insert into payslips (shop_id, run_id, staff_id, lines, gross_paise, deductions_paise,
       net_before_advance_paise, expense_payback_paise, advance_cut_paise, expense_cut_paise,
       net_pay_paise)
     values ($1, $2, $3, $4, $5, 0, $5, $6, $7, $8, $9) returning id`,
    [
      shop1,
      runId,
      meenaP,
      JSON.stringify([
        { kind: 'earned', amount: t.gross },
        { kind: 'expense_payback', amount: t.payback },
        { kind: 'expense_cut', amount: t.expenseCut },
      ]),
      t.gross,
      t.payback,
      t.cut,
      t.expenseCut,
      t.net ?? t.gross + t.payback - t.cut - t.expenseCut,
    ],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, meena, kiran] = (await Promise.all(
    ['asha', 'meena', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string];
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
    meenaP = await person(shop1, meena, 'Meena');
    kiranP = await person(shop2, kiran, 'Kiran');
    for (const [shop, p] of [
      [shop1, meenaP],
      [shop2, kiranP],
    ] as const)
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
        [shop, p],
      );
    cat = (
      await tx.query<{ id: string }>(
        `insert into expense_categories (shop_id, name, icon, colour) values ($1, 'Tea', 'coffee', 'amber') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
  });
});

describe('advance cut mode and expense switches (per staff)', () => {
  it('new staff cut the whole advance and settle expenses in salary', async () => {
    expect(
      await q(
        asha,
        'select advance_cut_mode, expense_payback, expense_recover from staff where person_id = $1',
        [meenaP],
      ),
    ).toEqual([{ advance_cut_mode: 'all', expense_payback: true, expense_recover: true }]);
    expect(
      await q(asha, 'select advance_cut_mode from advance_balances where staff_id = $1', [meenaP]),
    ).toEqual([{ advance_cut_mode: 'all' }]);
  });

  it('only all / fixed / none are allowed', async () => {
    await rejects(
      q(asha, `update staff set advance_cut_mode = 'half' where person_id = $1`, [meenaP]),
      /check constraint/,
    );
    await q(asha, `update staff set advance_cut_mode = 'fixed' where person_id = $1`, [meenaP]);
    await q(asha, `update staff set advance_cut_mode = 'all' where person_id = $1`, [meenaP]);
  });
});

describe('expenses to settle through salary', () => {
  it('a staff-paid expense to pay back and a charge to them show as dues', async () => {
    const add = (paid: [string, string | null], charged: [string, string | null], amount: number) =>
      q(
        asha,
        `insert into expenses (shop_id, date, amount_paise, category_id, paid_by_kind, paid_by_staff_id,
           charged_to_kind, charged_to_staff_id, reimburse)
         values ($1, '2026-10-20', $2, $3, $4, $5, $6, $7, $8)`,
        [shop1, amount, cat, paid[0], paid[1], charged[0], charged[1], paid[0] === 'staff'],
      );
    await add(['staff', meenaP], ['shop', null], 120_000);
    await add(['shop_cash', null], ['staff', meenaP], 30_000);
    expect(await dues(asha, meenaP)).toEqual({ payback: 120_000, charges: 30_000 });
  });

  it('staff see their own dues only; nothing crosses shops', async () => {
    expect(await dues(meena, meenaP)).toEqual({ payback: 120_000, charges: 30_000 });
    expect(await dues(kiran, meenaP)).toBeNull();
    expect(await dues(asha, kiranP)).toEqual({ payback: 0, charges: 0 });
    await rejects(q(null, 'select 1 from expense_balances'), /permission denied/);
  });

  it('net pay must add the pay-back and take off both cuts', async () => {
    runId = (
      await q<{ id: string }>(
        asha,
        `insert into salary_runs (shop_id, year, month) values ($1, 2026, 10) returning id`,
        [shop1],
      )
    )[0]!.id;
    await rejects(
      draft({ gross: 3_000_000, payback: 120_000, cut: 0, expenseCut: 30_000, net: 3_000_000 }),
      /payslips_net_pay_check/,
    );
    slip = (await draft({ gross: 3_000_000, payback: 120_000, cut: 0, expenseCut: 30_000 }))[0]!
      .id;
  });

  it('a draft settles nothing; finalizing settles the dues', async () => {
    expect(await dues(asha, meenaP)).toEqual({ payback: 120_000, charges: 30_000 });
    await q(asha, 'select public.finalize_payslip($1)', [slip]);
    expect(await dues(asha, meenaP)).toEqual({ payback: 0, charges: 0 });
  });

  it('paying net pay leaves the ledger at zero: the expense lines are settled by the salary', async () => {
    await q(
      asha,
      `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id)
       values ($1, $2, '2026-11-01', 'salary_payment', $3, 'cash', 'payslips', $4)`,
      [shop1, meenaP, -(3_000_000 + 120_000 - 30_000), slip],
    );
    expect(
      n(
        (
          await q<{ b: unknown }>(
            asha,
            'select balance_paise as b from ledger_balances where staff_id = $1',
            [meenaP],
          )
        )[0]!.b,
      ),
    ).toBe(0);
  });
});
