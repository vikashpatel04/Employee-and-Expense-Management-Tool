import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Counter" role: expenses.add only.
 *   Priya: Shop 1 "Accounts": expenses.add, expenses.view_all, expenses.edit.
 *   Meena: Shop 1 staff (login, no roles).
 *   Kiran: Shop 2 staff (login).
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, priya: string, meena: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string, raviP: string;
let tea: string, travel: string, shop2Cat: string;
let raviExpense: string, charged: string, reimbursed: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const n = (v: unknown) => Number(v);

const balance = async (staff: string) =>
  n(
    (
      await q<{ b: unknown }>(
        asha,
        'select balance_paise as b from ledger_balances where staff_id = $1',
        [staff],
      )
    )[0]?.b ?? 0,
  );
const lines = (staff: string) =>
  q<{ type: string; amount_paise: unknown; reverses_id: string | null }>(
    asha,
    `select type, amount_paise, reverses_id from ledger_entries
     where staff_id = $1 and ref_table = 'expenses' order by created_at, type`,
    [staff],
  );

const add = (
  user: string,
  e: {
    amount: number;
    category?: string;
    shop?: string;
    paidBy?: ['owner' | 'shop_cash'] | ['staff', string];
    chargedTo?: ['shop' | 'not_tracked'] | ['staff', string];
    reimburse?: boolean;
    bill?: string;
  },
) =>
  q<{ id: string; created_by: string }>(
    user,
    `insert into expenses (shop_id, date, amount_paise, category_id, paid_by_kind, paid_by_staff_id,
       charged_to_kind, charged_to_staff_id, reimburse, bill_path)
     values ($1, '2026-10-20', $2, $3, $4, $5, $6, $7, $8, $9) returning id, created_by`,
    [
      e.shop ?? shop1,
      e.amount,
      e.category ?? tea,
      (e.paidBy ?? ['owner'])[0],
      (e.paidBy ?? ['owner'])[1] ?? null,
      (e.chargedTo ?? ['shop'])[0],
      (e.chargedTo ?? ['shop'])[1] ?? null,
      e.reimburse ?? false,
      e.bill ?? null,
    ],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, priya, meena, kiran] = (await Promise.all(
    ['asha', 'ravi', 'priya', 'meena', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string, string, string];
  shop1 = (await q<{ id: string }>(asha, `select public.create_shop('Main Road', 'Asha') as id`))[0]!
    .id;
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
    for (const [shop, p] of [
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
    await role('Counter', ['expenses.add'], raviP);
    await role('Accounts', ['expenses.add', 'expenses.view_all', 'expenses.edit'], priyaP);
  });
});

describe('expense categories', () => {
  it('the owner adds them; everyone in the shop reads them', async () => {
    const cat = async (shop: string, name: string) =>
      (
        await q<{ id: string }>(
          asha,
          `insert into expense_categories (shop_id, name, icon, colour) values ($1, $2, 'coffee', 'amber') returning id`,
          [shop, name],
        )
      )[0]!.id;
    tea = await cat(shop1, 'Tea');
    travel = await cat(shop1, 'Travel');
    shop2Cat = await cat(shop2, 'Tea');
    expect(await q(meena, 'select name from expense_categories order by name')).toEqual([
      { name: 'Tea' },
      { name: 'Travel' },
    ]);
  });

  it('needs expenses.categories to add or change, and has no delete', async () => {
    await rejects(
      q(ravi, `insert into expense_categories (shop_id, name) values ($1, 'Snacks')`, [shop1]),
      /row-level security/,
    );
    expect(
      await q(ravi, `update expense_categories set name = 'Chai' where id = $1 returning id`, [tea]),
    ).toEqual([]);
    expect(
      await q(asha, `delete from expense_categories where id = $1 returning id`, [tea]),
    ).toEqual([]);
  });

  it('rejects bad icon keys and another shop reading them', async () => {
    await rejects(
      q(asha, `insert into expense_categories (shop_id, name, icon) values ($1, 'X', '<svg>')`, [
        shop1,
      ]),
      /check/,
    );
    expect(await q(kiran, 'select name from expense_categories')).toEqual([{ name: 'Tea' }]);
  });
});

describe('expenses', () => {
  it('expenses.add adds; the author is stamped; a shop expense posts nothing', async () => {
    const [row] = await add(ravi, { amount: 4_000 });
    raviExpense = row!.id;
    expect(row!.created_by).toBe(raviP);
    expect(await lines(meenaP)).toEqual([]);
  });

  it('charged to staff posts a staff charge; paid by staff with reimburse posts a reimbursement', async () => {
    charged = (await add(priya, { amount: 50_000, chargedTo: ['staff', meenaP] }))[0]!.id;
    reimbursed = (
      await add(priya, {
        amount: 12_000,
        category: travel,
        paidBy: ['staff', meenaP],
        reimburse: true,
      })
    )[0]!.id;
    expect((await lines(meenaP)).map((l) => [l.type, n(l.amount_paise)])).toEqual([
      ['staff_charge', -50_000],
      ['reimbursement', 12_000],
    ]);
    expect(await balance(meenaP)).toBe(-38_000);
  });

  it('rejects impossible combinations', async () => {
    await rejects(add(asha, { amount: 100, reimburse: true }), /check/);
    await rejects(
      q(asha, `insert into expenses (shop_id, date, amount_paise, category_id, charged_to_kind)
               values ($1, '2026-10-20', 100, $2, 'staff')`, [shop1, tea]),
      /check/,
    );
    await rejects(add(asha, { amount: 0 }), /check/);
    await rejects(add(asha, { amount: 100, bill: `${shop2}/x.jpg` }), /check/);
  });

  it('without expenses.add nobody adds; another shop can\'t be charged', async () => {
    await rejects(add(meena, { amount: 100 }), /row-level security/);
    await rejects(add(asha, { amount: 100, chargedTo: ['staff', kiranP] }), /foreign key/);
    await rejects(add(asha, { amount: 100, category: shop2Cat }), /foreign key/);
  });

  it('who sees what: view_all sees all, others their own and the ones on their ledger', async () => {
    const seen = async (user: string) =>
      (await q<{ id: string }>(user, 'select id from expenses')).map((r) => r.id).sort();
    expect(await seen(priya)).toEqual([raviExpense, charged, reimbursed].sort());
    expect(await seen(ravi)).toEqual([raviExpense]);
    expect(await seen(meena)).toEqual([charged, reimbursed].sort());
    expect(await seen(kiran)).toEqual([]);
  });

  it('a note change moves no money; changing the amount reverses and re-posts', async () => {
    await q(priya, `update expenses set note = 'Uniform' where id = $1`, [charged]);
    expect((await lines(meenaP)).length).toBe(2);

    await q(priya, `update expenses set amount_paise = 30000 where id = $1`, [charged]);
    const after = (await lines(meenaP)).map((l) => [l.type, n(l.amount_paise)]);
    expect(after).toEqual(
      expect.arrayContaining([
        ['staff_charge', -50_000],
        ['reversal', 50_000],
        ['staff_charge', -30_000],
      ]),
    );
    expect(await balance(meenaP)).toBe(-18_000);
  });

  it('moving a charge from staff to the shop takes it off their ledger', async () => {
    await q(
      priya,
      `update expenses set charged_to_kind = 'shop', charged_to_staff_id = null where id = $1`,
      [charged],
    );
    expect(await balance(meenaP)).toBe(12_000);
  });

  it('expenses.edit is needed to change or delete; the author alone can\'t', async () => {
    expect(
      await q(ravi, `update expenses set amount_paise = 1 where id = $1 returning id`, [raviExpense]),
    ).toEqual([]);
    expect(await q(ravi, `delete from expenses where id = $1 returning id`, [raviExpense])).toEqual(
      [],
    );
  });

  it('deleting reverses its lines; the ledger keeps the history', async () => {
    await q(priya, `delete from expenses where id = $1`, [reimbursed]);
    expect(await balance(meenaP)).toBe(0);
    const all = await lines(meenaP);
    expect(all.filter((l) => l.type === 'reversal').length).toBe(3);
  });

  it('expense lines can\'t be written to the ledger directly', async () => {
    await rejects(
      q(asha, `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise)
               values ($1, $2, '2026-10-20', 'staff_charge', -100)`, [shop1, meenaP]),
      /row-level security/,
    );
  });
});

describe('bill photos (storage)', () => {
  const upload = (user: string, path: string) =>
    // Storage stamps the uploader as owner_id.
    q(
      user,
      `insert into storage.objects (bucket_id, name, owner_id) values ('bills', $1, $2) returning id`,
      [path, user],
    );

  it('the bucket exists and is private', async () => {
    expect(
      await q(asha, `select public from storage.buckets where id = 'bills'`),
    ).toEqual([{ public: false }]);
  });

  it('expenses.add uploads into its own shop only', async () => {
    await upload(ravi, `${shop1}/bill-1.jpg`);
    await rejects(upload(ravi, `${shop2}/bill-1.jpg`), /row-level security/);
    await rejects(upload(meena, `${shop1}/bill-2.jpg`), /row-level security/);
    await rejects(upload(ravi, `not-a-shop/bill.jpg`), /row-level security/);
  });

  it('a bill is readable by whoever can see an expense that points at it', async () => {
    const path = `${shop1}/bill-1.jpg`;
    const readable = async (user: string) =>
      (await q(user, `select name from storage.objects where name = $1`, [path])).length === 1;
    expect(await readable(ravi)).toBe(true); // the uploader
    expect(await readable(priya)).toBe(false); // no expense points at it yet
    await add(ravi, { amount: 2_500, bill: path });
    expect(await readable(ravi)).toBe(true);
    expect(await readable(priya)).toBe(true);
    expect(await readable(meena)).toBe(false);
    expect(await readable(kiran)).toBe(false);
  });

  it('removing a bill needs expenses.edit', async () => {
    const path = `${shop1}/bill-1.jpg`;
    expect(
      await q(ravi, `delete from storage.objects where name = $1 returning id`, [path]),
    ).toEqual([]);
    expect(
      (await q(priya, `delete from storage.objects where name = $1 returning id`, [path])).length,
    ).toBe(1);
  });
});
