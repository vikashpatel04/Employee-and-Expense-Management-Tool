import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Add or less on a month's salary (20261105000002). Asha owns Shop 1 and Shop 2. Ravi: Shop 1
 * custom role with salary.view and salary.run. Sita: Shop 1 custom role with salary.view only.
 * Meena: Shop 1 staff (login). Gopal: Shop 1 staff (login). Kiran: Shop 2 staff (login).
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, sita: string, meena: string, gopal: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, kiranP: string, raviP: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const add = (user: string, shop: string, staff: string, name = 'Festival bonus', month = 10) =>
  q<{ id: string }>(
    user,
    `insert into salary_adjustments (shop_id, staff_id, year, month, kind, name, amount_paise)
     values ($1, $2, 2026, $3, 'add', $4, 100000) returning id`,
    [shop, staff, month, name],
  );

const names = (user: string) =>
  q<{ name: string }>(user, 'select name from salary_adjustments order by name').then((rows) =>
    rows.map((r) => r.name),
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, sita, meena, gopal, kiran] = (await Promise.all(
    ['asha', 'ravi', 'sita', 'meena', 'gopal', 'kiran'].map((x) =>
      createAuthUser(db, `${x}@shop.test`),
    ),
  )) as [string, string, string, string, string, string];
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
    const staff = (shop: string, id: string) =>
      tx.query(
        `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-09-16')`,
        [shop, id],
      );
    meenaP = await person(shop1, meena, 'Meena');
    await staff(shop1, meenaP);
    await staff(shop1, await person(shop1, gopal, 'Gopal'));
    kiranP = await person(shop2, kiran, 'Kiran');
    await staff(shop2, kiranP);
    raviP = await person(shop1, ravi, 'Ravi');
    const sitaP = await person(shop1, sita, 'Sita');
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
    await role('Accounts', ['salary.view', 'salary.run'], raviP);
    await role('Viewer', ['salary.view'], sitaP);
  });
});

describe('who can add and see entries', () => {
  it('the owner and a role with salary.run can add', async () => {
    expect(await add(asha, shop1, meenaP, 'Owner bonus')).toHaveLength(1);
    expect(await add(ravi, shop1, meenaP, 'Festival bonus')).toHaveLength(1);
  });

  it('salary.view alone can read but not add or remove', async () => {
    expect(await names(sita)).toEqual(['Festival bonus', 'Owner bonus']);
    await rejects(add(sita, shop1, meenaP), /row-level security/);
    await q(sita, 'delete from salary_adjustments');
    expect(await names(asha)).toHaveLength(2);
  });

  it('staff see their own and can’t add one for themselves', async () => {
    expect(await names(meena)).toEqual(['Festival bonus', 'Owner bonus']);
    expect(await names(gopal)).toEqual([]);
    await rejects(add(meena, shop1, meenaP), /row-level security/);
  });

  it('nobody signed out sees or adds anything', async () => {
    await rejects(q(null, 'select * from salary_adjustments'), /permission denied/);
  });
});

describe('between shops', () => {
  it('a role in one shop reaches nothing in another', async () => {
    await rejects(add(ravi, shop2, kiranP), /row-level security/);
    await add(asha, shop2, kiranP, 'Branch bonus');
    expect(await names(ravi)).not.toContain('Branch bonus');
    expect(await names(kiran)).toEqual(['Branch bonus']);
  });

  it('an entry can’t name a person from another shop', async () => {
    await rejects(add(asha, shop1, kiranP), /foreign key/);
  });
});

describe('what an entry can be', () => {
  const bad = (name: string, amount: number, kind = 'less') =>
    q(
      ravi,
      `insert into salary_adjustments (shop_id, staff_id, year, month, kind, name, amount_paise)
       values ($1, $2, 2026, 10, $3, $4, $5)`,
      [shop1, meenaP, kind, name, amount],
    );

  it('needs a name, an amount above zero and add or less', async () => {
    await rejects(bad('   ', 100), /salary_adjustments_name_check/);
    await rejects(bad('x'.repeat(61), 100), /salary_adjustments_name_check/);
    await rejects(bad('Uniform', 0), /salary_adjustments_amount_paise_check/);
    await rejects(bad('Uniform', -5), /salary_adjustments_amount_paise_check/);
    await rejects(bad('Uniform', 100, 'bonus'), /salary_adjustments_kind_check/);
  });

  it('is never edited: remove it and add another', async () => {
    await rejects(q(ravi, `update salary_adjustments set amount_paise = 1`), /permission denied/);
  });

  it('can be removed until the salary is finalized', async () => {
    await q(ravi, `delete from salary_adjustments where name = 'Owner bonus'`);
    expect(await names(ravi)).toEqual(['Festival bonus']);
  });
});

describe('once finalized', () => {
  beforeAll(async () => {
    const run = (
      await q<{ id: string }>(
        ravi,
        `insert into salary_runs (shop_id, year, month) values ($1, 2026, 10) returning id`,
        [shop1],
      )
    )[0]!.id;
    const slip = (
      await q<{ id: string }>(
        ravi,
        `insert into payslips (shop_id, run_id, staff_id, lines, gross_paise,
           net_before_advance_paise, net_pay_paise)
         values ($1, $2, $3, $4, 1600000, 1600000, 1600000) returning id`,
        [
          shop1,
          run,
          meenaP,
          JSON.stringify([
            { kind: 'earned', amount: 1_500_000 },
            { kind: 'allowance', name: 'Festival bonus', amount: 100_000, oneOff: true },
          ]),
        ],
      )
    )[0]!.id;
    await q(ravi, 'select public.finalize_payslip($1)', [slip]);
  });

  it('that month is locked for that person', async () => {
    await rejects(add(ravi, shop1, meenaP, 'Late bonus'), /already finalized/);
    await rejects(
      q(ravi, `delete from salary_adjustments where staff_id = $1`, [meenaP]),
      /already finalized/,
    );
    expect(await names(ravi)).toEqual(['Festival bonus']);
  });

  it('the next month is still open', async () => {
    expect(await add(ravi, shop1, meenaP, 'November bonus', 11)).toHaveLength(1);
  });

  it('a bonus is in the salary line on the ledger, once', async () => {
    expect(
      await q(
        ravi,
        `select type, amount_paise::int as amount from ledger_entries where staff_id = $1`,
        [meenaP],
      ),
    ).toEqual([{ type: 'salary_earned', amount: 1_600_000 }]);
  });
});
