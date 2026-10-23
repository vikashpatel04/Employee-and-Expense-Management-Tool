import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Accounts" role: salary.view, salary.run, advances.give (NOT salary.undo_payment).
 *   Priya: Shop 1 "Supervisor": staff.view only.
 *   Meena: Shop 1 staff, limit ₹8,000 on advances.
 *   Kiran: Shop 2 staff.
 * The tests run in order and walk one month of money for Meena.
 */
let db: Db;
let asha: string, ravi: string, priya: string, meena: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string, raviP: string;
let runId: string, slip1: string, slip2: string, payment: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const n = (v: unknown) => Number(v);

const balance = async (user: string, staff: string) =>
  n(
    (
      await q<{ b: unknown }>(
        user,
        'select balance_paise as b from ledger_balances where staff_id = $1',
        [staff],
      )
    )[0]?.b ?? 0,
  );
const outstanding = async (user: string, staff: string) =>
  n(
    (
      await q<{ o: unknown }>(
        user,
        'select outstanding_paise as o from advance_balances where staff_id = $1',
        [staff],
      )
    )[0]?.o,
  );

const give = (
  user: string,
  amount: number,
  extra: { confirmed?: boolean; kind?: string; staff?: string; shop?: string } = {},
) =>
  q(
    user,
    `insert into advances (shop_id, staff_id, date, kind, amount_paise, over_limit_confirmed)
     values ($1, $2, '2026-10-05', $3, $4, $5)`,
    [
      extra.shop ?? shop1,
      extra.staff ?? meenaP,
      extra.kind ?? 'given',
      amount,
      extra.confirmed ?? false,
    ],
  );

// October payslip calculated by packages/core (₹30,000; PF ₹1,800; late ₹44; advance cut ₹2,000)
const octLines = [
  { kind: 'earned', amount: 3_000_000 },
  { kind: 'deduction', name: 'PF', amount: 180_000 },
  { kind: 'late_deduction', amount: 4_400 },
  { kind: 'advance_cut', amount: 200_000 },
];

const draft = (
  user: string,
  lines: object[],
  totals: { gross: number; deductions: number; cut: number },
) =>
  q<{ id: string; revision: number }>(
    user,
    `insert into payslips (shop_id, run_id, staff_id, lines, leave, gross_paise, deductions_paise,
       net_before_advance_paise, advance_cut_paise, net_pay_paise)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, revision`,
    [
      shop1,
      runId,
      meenaP,
      JSON.stringify(lines),
      JSON.stringify({ opening: 0, earned: 2, used: 1, carried: 0, paidOut: 0, lapsed: 1 }),
      totals.gross,
      totals.deductions,
      totals.gross - totals.deductions,
      totals.cut,
      totals.gross - totals.deductions - totals.cut,
    ],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, priya, meena, kiran] = (await Promise.all(
    ['asha', 'ravi', 'priya', 'meena', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
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
    const priyaP = await person(shop1, priya, 'Priya');
    meenaP = await person(shop1, meena, 'Meena');
    kiranP = await person(shop2, kiran, 'Kiran');
    await tx.query(
      `insert into staff (shop_id, person_id, joining_date, advance_limit_paise) values ($1, $2, '2026-01-01', 800000)`,
      [shop1, meenaP],
    );
    await tx.query(
      `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
      [shop2, kiranP],
    );

    const role = async (name: string, keys: string[], member: string) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into roles (shop_id, name) values ($1, $2) returning id',
          [shop1, name],
        )
      ).rows[0]!.id;
      for (const k of keys)
        await tx.query(
          'insert into role_permissions (role_id, permission_key, shop_id) values ($1, $2, $3)',
          [id, k, shop1],
        );
      await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
        member,
        id,
        shop1,
      ]);
    };
    await role('Accounts', ['salary.view', 'salary.run', 'advances.give'], raviP);
    await role('Supervisor', ['staff.view'], priyaP);
  });
});

describe('advances', () => {
  it('giving an advance posts a negative ledger line, recorded as the giver', async () => {
    await give(ravi, 500_000);
    const lines = await q<{ type: string; amount_paise: unknown; created_by: string }>(
      asha,
      'select type, amount_paise, created_by from ledger_entries',
    );
    expect(lines.map((l) => [l.type, n(l.amount_paise), l.created_by])).toEqual([
      ['advance', -500_000, raviP],
    ]);
    expect(await outstanding(asha, meenaP)).toBe(500_000);
  });

  it('crossing the person’s limit needs confirmation', async () => {
    await rejects(give(ravi, 400_000), /crosses the person's limit/);
    await give(ravi, 400_000, { confirmed: true });
    expect(await outstanding(asha, meenaP)).toBe(900_000);
  });

  it('cash repaid reduces what is outstanding', async () => {
    await give(ravi, 100_000, { kind: 'repaid' });
    expect(await outstanding(asha, meenaP)).toBe(800_000);
    expect(await balance(asha, meenaP)).toBe(-800_000);
  });

  it('advances and ledger lines can never be changed or deleted, even by the owner', async () => {
    await rejects(
      q(asha, 'update ledger_entries set amount_paise = 1'),
      /append-only|permission denied/,
    );
    await rejects(q(asha, 'delete from advances'), /append-only|permission denied/);
    await rejects(db.query('update ledger_entries set amount_paise = 1'), /append-only/);
    await rejects(db.query('delete from advances'), /append-only/);
  });

  it('salary lines cannot be written directly, only by finalizing a payslip', async () => {
    await rejects(
      q(
        asha,
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise) values ($1, $2, '2026-10-31', 'salary_earned', 100)`,
        [shop1, meenaP],
      ),
      /row-level security/,
    );
  });

  it("advances.give in shop 1 can't give in shop 2", async () => {
    await rejects(give(ravi, 1_000, { shop: shop2, staff: kiranP }), /row-level security/);
  });
});

describe('salary run and payslip', () => {
  it('salary.run creates a run and a draft payslip, revision 1', async () => {
    runId = (
      await q<{ id: string }>(
        ravi,
        `insert into salary_runs (shop_id, year, month) values ($1, 2026, 10) returning id`,
        [shop1],
      )
    )[0]!.id;
    const [row] = await draft(ravi, octLines, {
      gross: 3_000_000,
      deductions: 184_400,
      cut: 200_000,
    });
    slip1 = row!.id;
    expect(row!.revision).toBe(1);
  });

  it('staff don’t see drafts; the totals must add up', async () => {
    expect(await q(meena, 'select 1 from payslips')).toHaveLength(0);
    await rejects(
      q(ravi, `update payslips set net_pay_paise = 1 where id = $1`, [slip1]),
      /check constraint/,
    );
  });

  it('a draft cannot be marked final by hand', async () => {
    await rejects(
      q(ravi, `update payslips set status = 'finalized' where id = $1`, [slip1]),
      /finalize_payslip/,
    );
  });

  it('finalizing posts earned and deductions to the ledger, not the advance cut', async () => {
    await q(ravi, 'select public.finalize_payslip($1)', [slip1]);
    const lines = await q<{
      type: string;
      name: string | null;
      amount_paise: unknown;
      date: unknown;
    }>(
      asha,
      `select type, name, amount_paise, to_char(date, 'YYYY-MM-DD') as date from ledger_entries where ref_table = 'payslips' order by amount_paise desc`,
    );
    expect(lines.map((l) => [l.type, l.name, n(l.amount_paise), l.date])).toEqual([
      ['salary_earned', null, 3_000_000, '2026-10-31'],
      ['late_deduction', null, -4_400, '2026-10-31'],
      ['deduction', 'PF', -180_000, '2026-10-31'],
    ]);
    // −₹8,000 advance + ₹30,000 − ₹1,800 − ₹44 = ₹20,156 owed to Meena
    expect(await balance(asha, meenaP)).toBe(2_015_600);
    // the ₹2,000 cut now counts against the advance
    expect(await outstanding(asha, meenaP)).toBe(600_000);
  });

  it('finalizing records the leave month and shows the payslip to the staff member', async () => {
    const [b] = await q<{ used: number; lapsed: number }>(
      meena,
      'select used, lapsed from leave_balances',
    );
    expect(b).toEqual({ used: 1, lapsed: 1 });
    expect(await q(meena, 'select 1 from payslips')).toHaveLength(1);
  });

  it('a finalized payslip never changes and cannot be finalized twice', async () => {
    await rejects(
      q(ravi, `update payslips set pdf_path = 'x' where id = $1`, [slip1]),
      /can't be changed/,
    );
    await rejects(q(ravi, 'delete from payslips where id = $1', [slip1]), /can't be changed/);
    await rejects(q(ravi, 'select public.finalize_payslip($1)', [slip1]), /already finalized/);
  });

  it('only salary.run can finalize', async () => {
    await rejects(q(priya, 'select public.finalize_payslip($1)', [slip1]), /not found/);
  });
});

describe('payment and undo', () => {
  const pay = (user: string, amount: number) =>
    q<{ id: string }>(
      user,
      `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, payment_mode, ref_table, ref_id)
       values ($1, $2, '2026-11-01', 'salary_payment', $3, 'upi', 'payslips', $4) returning id`,
      [shop1, meenaP, -amount, slip1],
    );

  it('paying net pay settles the month; what is left is the uncut advance', async () => {
    payment = (await pay(ravi, 2_615_600))[0]!.id;
    expect(await balance(asha, meenaP)).toBe(-600_000);
    expect(await outstanding(asha, meenaP)).toBe(600_000);
  });

  it('cannot pay more than net pay', async () => {
    await rejects(pay(ravi, 100), /more than the payslip/);
  });

  it('undo payment needs salary.undo_payment', async () => {
    await rejects(
      q(
        ravi,
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id) values ($1, $2, '2026-11-02', 'reversal', 2615600, $3)`,
        [shop1, meenaP, payment],
      ),
      /row-level security/,
    );
  });

  it('the owner can undo it once, with the exact opposite amount', async () => {
    const undo = (amount: number) =>
      q<{ id: string }>(
        asha,
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id) values ($1, $2, '2026-11-02', 'reversal', $3, $4) returning id`,
        [shop1, meenaP, amount, payment],
      );
    await rejects(undo(1_000), /exact opposite/);
    const [rev] = await undo(2_615_600);
    expect(await balance(asha, meenaP)).toBe(2_015_600);
    await rejects(undo(2_615_600), /duplicate key|ledger_one_reversal_each/);
    await rejects(
      q(
        asha,
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id) values ($1, $2, '2026-11-02', 'reversal', -2615600, $3)`,
        [shop1, meenaP, rev!.id],
      ),
      /can't be reversed/,
    );
  });

  it('after an undo the payslip can be paid again', async () => {
    await pay(ravi, 2_615_600);
    expect(await balance(asha, meenaP)).toBe(-600_000);
  });
});

describe('re-running a finalized month', () => {
  it('a new revision is a draft; only one draft at a time', async () => {
    // attendance fixed: one more absent day → earned ₹29,000, late charge waived
    const [row] = await draft(
      ravi,
      [
        { kind: 'earned', amount: 2_900_000 },
        { kind: 'deduction', name: 'PF', amount: 180_000 },
        { kind: 'advance_cut', amount: 200_000 },
      ],
      { gross: 2_900_000, deductions: 180_000, cut: 200_000 },
    );
    slip2 = row!.id;
    expect(row!.revision).toBe(2);
    await rejects(
      draft(ravi, octLines, { gross: 3_000_000, deductions: 184_400, cut: 200_000 }),
      /current draft/,
    );
  });

  it('finalizing it posts only the differences as adjustments', async () => {
    await q(ravi, 'select public.finalize_payslip($1)', [slip2]);
    const adj = await q<{ adjusts: string; amount_paise: unknown }>(
      asha,
      `select adjusts, amount_paise from ledger_entries where type = 'adjustment' order by adjusts`,
    );
    expect(adj.map((a) => [a.adjusts, n(a.amount_paise)])).toEqual([
      ['late_deduction', 4_400],
      ['salary_earned', -100_000],
    ]);
    // balance moves by exactly the difference: −₹6,000 − ₹1,000 + ₹44
    expect(await balance(asha, meenaP)).toBe(-600_000 - 100_000 + 4_400);
    // the advance cut is the same in both revisions, so outstanding is unchanged
    expect(await outstanding(asha, meenaP)).toBe(600_000);
  });
});

describe('who sees the money', () => {
  it('staff see their own ledger and balance; staff.view alone sees none', async () => {
    expect((await q(meena, 'select 1 from ledger_entries')).length).toBeGreaterThan(0);
    expect(await balance(meena, meenaP)).toBe(-695_600);
    expect(await q(priya, 'select 1 from ledger_entries')).toHaveLength(0);
    expect(await q(priya, 'select 1 from payslips')).toHaveLength(0);
  });

  it('other shops see nothing', async () => {
    expect(await q(kiran, 'select 1 from ledger_entries')).toHaveLength(0);
    expect(await q(kiran, 'select 1 from salary_runs')).toHaveLength(0);
  });

  it('opening balance: once per person, needs staff.pay.edit', async () => {
    const open = (user: string) =>
      q(
        user,
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise) values ($1, $2, '2026-01-01', 'opening_balance', 50000)`,
        [shop1, meenaP],
      );
    await rejects(open(ravi), /row-level security/);
    await open(asha);
    await rejects(open(asha), /duplicate key|ledger_one_opening_balance/);
  });

  it('anonymous users get nothing', async () => {
    await rejects(q(null, 'select 1 from ledger_entries'), /permission denied/);
    await rejects(q(null, 'select 1 from ledger_balances'), /permission denied/);
  });
});
