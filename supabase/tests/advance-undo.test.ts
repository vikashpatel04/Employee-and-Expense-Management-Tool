import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, type Db } from './harness';

/** Undoing an advance (reversing its ledger line) must also take it off the advance to recover. */
let db: Db;
let asha: string, shop: string, meenaP: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  as(db, asha, async (tx) => (await tx.query<T>(sql, params)).rows);
const outstanding = async () =>
  Number(
    (
      await q<{ o: unknown }>(
        'select outstanding_paise as o from advance_balances where staff_id = $1',
        [meenaP],
      )
    )[0]?.o,
  );
const balance = async () =>
  Number(
    (
      await q<{ b: unknown }>(
        'select balance_paise as b from ledger_balances where staff_id = $1',
        [meenaP],
      )
    )[0]?.b ?? 0,
  );

beforeAll(async () => {
  db = await freshDb();
  asha = await createAuthUser(db, 'asha@shop.test');
  shop = (await q<{ id: string }>(`select public.create_shop('Main Road', 'Asha') as id`))[0]!.id;
  meenaP = (
    await q<{ id: string }>(
      `insert into people (shop_id, name) values ($1, 'Meena') returning id`,
      [shop],
    )
  )[0]!.id;
  await q(`insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`, [
    shop,
    meenaP,
  ]);
});

describe('undoing an advance', () => {
  it('takes it off the outstanding advance as well as the balance', async () => {
    await q(
      `insert into advances (shop_id, staff_id, date, kind, amount_paise) values ($1, $2, '2026-10-05', 'given', 300000)`,
      [shop, meenaP],
    );
    const [keep] = await q<{ id: string }>(
      `insert into advances (shop_id, staff_id, date, kind, amount_paise) values ($1, $2, '2026-10-06', 'given', 100000) returning id`,
      [shop, meenaP],
    );
    expect(await outstanding()).toBe(400_000);

    const [line] = await q<{ id: string }>(
      `select id from ledger_entries where ref_table = 'advances' and ref_id = $1`,
      [keep!.id],
    );
    await q(
      `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id)
       values ($1, $2, '2026-10-07', 'reversal', 100000, $3)`,
      [shop, meenaP, line!.id],
    );
    expect(await outstanding()).toBe(300_000);
    expect(await balance()).toBe(-300_000);
  });

  it('an undone repayment counts as not repaid', async () => {
    const [repaid] = await q<{ id: string }>(
      `insert into advances (shop_id, staff_id, date, kind, amount_paise) values ($1, $2, '2026-10-08', 'repaid', 50000) returning id`,
      [shop, meenaP],
    );
    expect(await outstanding()).toBe(250_000);
    const [line] = await q<{ id: string }>(
      `select id from ledger_entries where ref_table = 'advances' and ref_id = $1`,
      [repaid!.id],
    );
    await q(
      `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id)
       values ($1, $2, '2026-10-09', 'reversal', -50000, $3)`,
      [shop, meenaP, line!.id],
    );
    expect(await outstanding()).toBe(300_000);
  });
});
