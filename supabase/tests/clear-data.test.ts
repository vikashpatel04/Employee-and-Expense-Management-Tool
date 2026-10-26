import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * "Clear all data" (migration 20261026000003). Asha owns Shop 1 and Shop 2; Ravi is a Manager
 * in Shop 1 (every permission but he is not the owner). Tests run in order.
 */
let db: Db;
let asha: string, ravi: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const count = async (table: string, shop: string) =>
  Number(
    (
      await q<{ n: string }>(asha, `select count(*) as n from ${table} where shop_id = $1`, [shop])
    )[0]!.n,
  );

beforeAll(async () => {
  db = await freshDb();
  asha = await createAuthUser(db, 'asha@shop.test');
  ravi = await createAuthUser(db, 'ravi@shop.test');
  shop1 = (
    await q<{ id: string }>(asha, `select public.create_shop('Main Road', 'Asha') as id`)
  )[0]!.id;
  shop2 = (await q<{ id: string }>(asha, `select public.create_shop('Market', 'Asha') as id`))[0]!
    .id;
  await as(db, asha, async (tx) => {
    const person = async (shop: string, user: string | null, name: string) =>
      (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [shop, user, name],
        )
      ).rows[0]!.id;
    const raviP = await person(shop1, ravi, 'Ravi');
    meenaP = await person(shop1, null, 'Meena');
    kiranP = await person(shop2, null, 'Kiran');
    for (const [s, p] of [
      [shop1, meenaP],
      [shop2, kiranP],
    ] as const) {
      await tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
        [s, p],
      );
      await tx.query(
        `insert into attendance (shop_id, staff_id, date, status) values ($1, $2, '2026-10-20', 'present')`,
        [s, p],
      );
      await tx.query(
        `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise) values ($1, $2, '2026-10-20', 'opening_balance', 5000)`,
        [s, p],
      );
      await tx.query(
        `insert into staff_documents (shop_id, staff_id, name, file_path, mime_type, size_bytes) values ($1, $2, 'ID', $3, 'image/jpeg', 100)`,
        [s, p, `${s}/${p}/a.jpg`],
      );
    }
    // A finalized payslip (and its run) must not stop the clearing.
    const run = (
      await tx.query<{ id: string }>(
        `insert into salary_runs (shop_id, year, month) values ($1, 2026, 10) returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    const slip = (
      await tx.query<{ id: string }>(
        `insert into payslips (shop_id, run_id, staff_id, lines, leave, gross_paise, deductions_paise,
           net_before_advance_paise, advance_cut_paise, net_pay_paise)
         values ($1, $2, $3, '[]', '{}', 1000, 0, 1000, 0, 1000) returning id`,
        [shop1, run, meenaP],
      )
    ).rows[0]!.id;
    await tx.query('select public.finalize_payslip($1)', [slip]);
    const cat = (
      await tx.query<{ id: string }>(
        `insert into expense_categories (shop_id, name, icon, colour) values ($1, 'Tea', 'receipt', 'slate') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into expenses (shop_id, date, amount_paise, category_id, paid_by_kind, charged_to_kind, bill_path)
       values ($1, '2026-10-20', 1000, $2, 'owner', 'shop', $3)`,
      [shop1, cat, `${shop1}/bill.jpg`],
    );
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Manager') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id) select $1, key, $2 from permissions`,
      [role, shop1],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      raviP,
      role,
      shop1,
    ]);
  });
});

describe('clear_shop_data', () => {
  it('only the owner, even a role with every permission is refused', async () => {
    await rejects(q(ravi, 'select public.clear_shop_data($1)', [shop1]), /Only the shop owner/);
    await rejects(q(null, 'select public.clear_shop_data($1)', [shop1]), /permission denied/);
    expect(await count('ledger_entries', shop1)).toBe(2);
  });

  it('the ledger guard still holds for everyone, owner included', async () => {
    await rejects(
      q(asha, 'delete from ledger_entries where shop_id = $1', [shop1]),
      /permission denied|append-only/,
    );
  });

  it('clears the shop: records gone, setup and the owner stay, files are listed', async () => {
    const r = (
      await q<{ r: { counts: Record<string, number>; bills: string[]; docs: string[] } }>(
        asha,
        'select public.clear_shop_data($1) as r',
        [shop1],
      )
    )[0]!.r;
    expect(r.counts).toMatchObject({ staff: 1, expenses: 1, attendance: 1 });
    expect(r.bills).toEqual([`${shop1}/bill.jpg`]);
    expect(r.docs).toEqual([`${shop1}/${meenaP}/a.jpg`]);
    for (const t of [
      'staff',
      'attendance',
      'ledger_entries',
      'expenses',
      'staff_documents',
      'payslips',
      'salary_runs',
    ])
      expect(await count(t, shop1)).toBe(0);
    // owner and Ravi?  Ravi (not owner) is removed with the other people; the owner stays.
    const people = await q<{ name: string; is_owner: boolean }>(
      asha,
      'select name, is_owner from people where shop_id = $1',
      [shop1],
    );
    expect(people).toEqual([{ name: 'Asha', is_owner: true }]);
    // setup stays
    expect(await count('expense_categories', shop1)).toBe(1);
    expect(await count('roles', shop1)).toBe(1);
  });

  it('another shop is untouched, and the audit log keeps a record', async () => {
    expect(await count('ledger_entries', shop2)).toBe(1);
    expect(await count('staff', shop2)).toBe(1);
    const a = await q(
      asha,
      `select 1 from audit_log where shop_id = $1 and after ->> 'event' = 'clear_shop_data'`,
      [shop1],
    );
    expect(a.length).toBe(1);
    await rejects(
      q(asha, 'delete from audit_log where shop_id = $1', [shop1]),
      /permission denied|append-only/,
    );
  });

  it('the guards are back after clearing', async () => {
    await rejects(
      q(asha, 'delete from ledger_entries where shop_id = $1', [shop2]),
      /permission denied|append-only/,
    );
  });
});
