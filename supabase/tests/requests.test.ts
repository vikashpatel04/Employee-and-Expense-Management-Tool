import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Leave and advance requests (migration 20261024000004).
 *   Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Supervisor" role: requests.decide.
 *   Meena: Shop 1 staff with a login.
 *   Selvi: Shop 1 staff with a login.
 *   Kiran: Shop 2 staff with a login.
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, meena: string, selvi: string, kiran: string;
let shop1: string, shop2: string;
let meenaP: string, selviP: string, kiranP: string;
let leave: string, advance: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const ask = (
  user: string,
  shop: string,
  staff: string,
  r: { kind: 'leave'; from: string; to: string } | { kind: 'advance'; amount: number },
) =>
  q<{ id: string; status: string }>(
    user,
    `insert into requests (shop_id, staff_id, kind, from_date, to_date, amount_paise, note)
     values ($1, $2, $3, $4, $5, $6, 'please') returning id, status`,
    [
      shop,
      staff,
      r.kind,
      r.kind === 'leave' ? r.from : null,
      r.kind === 'leave' ? r.to : null,
      r.kind === 'advance' ? r.amount : null,
    ],
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, meena, selvi, kiran] = (await Promise.all(
    ['asha', 'ravi', 'meena', 'selvi', 'kiran'].map((x) => createAuthUser(db, `${x}@shop.test`)),
  )) as [string, string, string, string, string];
  const shop = async (name: string) =>
    (await q<{ id: string }>(asha, `select public.create_shop($1, 'Asha') as id`, [name]))[0]!.id;
  shop1 = await shop('Main Road');
  shop2 = await shop('Market');
  await as(db, asha, async (tx) => {
    const person = async (s: string, user: string, name: string, staff: boolean) => {
      const id = (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [s, user, name],
        )
      ).rows[0]!.id;
      if (staff)
        await tx.query(
          `insert into staff (shop_id, person_id, joining_date) values ($1, $2, '2026-01-01')`,
          [s, id],
        );
      return id;
    };
    const raviP = await person(shop1, ravi, 'Ravi', false);
    meenaP = await person(shop1, meena, 'Meena', true);
    selviP = await person(shop1, selvi, 'Selvi', true);
    kiranP = await person(shop2, kiran, 'Kiran', true);
    const role = (
      await tx.query<{ id: string }>(
        `insert into roles (shop_id, name) values ($1, 'Supervisor') returning id`,
        [shop1],
      )
    ).rows[0]!.id;
    await tx.query(
      `insert into role_permissions (role_id, permission_key, shop_id) values ($1, 'requests.decide', $2)`,
      [role, shop1],
    );
    await tx.query('insert into person_roles (person_id, role_id, shop_id) values ($1, $2, $3)', [
      raviP,
      role,
      shop1,
    ]);
  });
});

describe('asking', () => {
  it('staff ask for leave or an advance for themselves; it starts pending', async () => {
    const l = await ask(meena, shop1, meenaP, {
      kind: 'leave',
      from: '2030-02-02',
      to: '2030-02-03',
    });
    expect(l[0]!.status).toBe('pending');
    leave = l[0]!.id;
    advance = (await ask(meena, shop1, meenaP, { kind: 'advance', amount: 200000 }))[0]!.id;
  });

  it('cannot ask for someone else, in another shop, or pre-decided', async () => {
    await rejects(
      ask(meena, shop1, selviP, { kind: 'advance', amount: 100 }),
      /row-level security/,
    );
    await rejects(
      ask(kiran, shop1, kiranP, { kind: 'advance', amount: 100 }),
      /row-level security|foreign key|Only current staff/,
    );
    const r = await q<{ status: string; decided_at: unknown }>(
      selvi,
      `insert into requests (shop_id, staff_id, kind, amount_paise, status, decided_at)
       values ($1, $2, 'advance', 500, 'approved', now()) returning status, decided_at`,
      [shop1, selviP],
    );
    expect(r[0]).toEqual({ status: 'pending', decided_at: null });
  });

  it('leave needs dates in order; an advance needs an amount', async () => {
    await rejects(
      ask(meena, shop1, meenaP, { kind: 'leave', from: '2030-02-05', to: '2030-02-04' }),
      /check constraint/,
    );
    await rejects(ask(meena, shop1, meenaP, { kind: 'advance', amount: 0 }), /check constraint/);
  });

  it('only current staff can ask', async () => {
    await q(
      asha,
      `update staff set status = 'left', leaving_date = '2026-06-30' where person_id = $1`,
      [selviP],
    );
    await rejects(
      ask(selvi, shop1, selviP, { kind: 'advance', amount: 100 }),
      /Only current staff/,
    );
    await q(asha, `update staff set status = 'active', leaving_date = null where person_id = $1`, [
      selviP,
    ]);
  });
});

describe('who sees them', () => {
  it('staff see their own; deciders see the shop; other shops see nothing', async () => {
    expect((await q(meena, 'select id from requests')).length).toBe(2);
    expect((await q(selvi, 'select staff_id from requests')).map((r) => r.staff_id)).toEqual([
      selviP,
    ]);
    expect((await q(ravi, 'select id from requests')).length).toBe(3);
    expect((await q(asha, 'select id from requests where shop_id = $1', [shop1])).length).toBe(3);
    expect(await q(kiran, 'select id from requests where shop_id = $1', [shop1])).toEqual([]);
  });
});

describe('deciding', () => {
  it('staff cannot approve their own request', async () => {
    await rejects(
      q(meena, `update requests set status = 'approved' where id = $1`, [leave]),
      /Not allowed to decide/,
    );
  });

  it('a decider approves leave; the decision is stamped', async () => {
    const r = await q<{ status: string; leave_status: string; decided_by: string | null }>(
      ravi,
      `update requests set status = 'approved', leave_status = 'paid_leave' where id = $1
       returning status, leave_status, decided_by`,
      [leave],
    );
    expect(r[0]).toMatchObject({ status: 'approved', leave_status: 'paid_leave' });
    expect(r[0]!.decided_by).not.toBeNull();
  });

  it('an approved request can only be rejected later, not cancelled or approved again', async () => {
    await rejects(
      q(asha, `update requests set status = 'approved' where id = $1`, [leave]),
      /already approved/,
    );
    await rejects(
      q(meena, `update requests set status = 'cancelled' where id = $1`, [leave]),
      /already approved/,
    );
  });

  it('the request itself cannot be edited, only decided', async () => {
    await rejects(
      q(asha, `update requests set amount_paise = 1 where id = $1`, [advance]),
      /can't be changed/,
    );
  });

  it('an approved advance request links the advance it gave (same person only)', async () => {
    const adv = async (staff: string) =>
      (
        await q<{ id: string }>(
          asha,
          `insert into advances (shop_id, staff_id, date, amount_paise) values ($1, $2, '2030-01-10', 200000)
           returning id`,
          [shop1, staff],
        )
      )[0]!.id;
    const selvis = await adv(selviP);
    await rejects(
      q(ravi, `update requests set status = 'approved', advance_id = $2 where id = $1`, [
        advance,
        selvis,
      ]),
      /not for this person/,
    );
    const meenas = await adv(meenaP);
    const r = await q<{ advance_id: string }>(
      ravi,
      `update requests set status = 'approved', advance_id = $2 where id = $1 returning advance_id`,
      [advance, meenas],
    );
    expect(r[0]!.advance_id).toBe(meenas);
  });

  it('staff cancel their own pending request; nobody else can', async () => {
    const id = (
      await ask(selvi, shop1, selviP, { kind: 'leave', from: '2030-03-01', to: '2030-03-01' })
    )[0]!.id;
    await rejects(
      q(ravi, `update requests set status = 'cancelled' where id = $1`, [id]),
      /Only the person who asked/,
    );
    const r = await q<{ status: string }>(
      selvi,
      `update requests set status = 'cancelled' where id = $1 returning status`,
      [id],
    );
    expect(r[0]!.status).toBe('cancelled');
  });

  it('a rejected request keeps no leave or advance', async () => {
    const id = (
      await ask(selvi, shop1, selviP, { kind: 'leave', from: '2030-04-01', to: '2030-04-02' })
    )[0]!.id;
    const r = await q<{ status: string; leave_status: string | null }>(
      ravi,
      `update requests set status = 'rejected', leave_status = 'paid_leave', decision_note = 'busy week'
       where id = $1 returning status, leave_status`,
      [id],
    );
    expect(r[0]).toEqual({ status: 'rejected', leave_status: null });
  });

  it('a rejected request is final', async () => {
    const id = (
      await ask(selvi, shop1, selviP, { kind: 'leave', from: '2030-04-10', to: '2030-04-10' })
    )[0]!.id;
    await q(ravi, `update requests set status = 'rejected' where id = $1`, [id]);
    await rejects(
      q(ravi, `update requests set status = 'approved' where id = $1`, [id]),
      /already rejected/,
    );
  });

  it('requests are never deleted', async () => {
    await rejects(q(asha, 'delete from requests where id = $1', [leave]), /permission denied/);
  });

  it('another shop cannot decide', async () => {
    const id = (await ask(kiran, shop2, kiranP, { kind: 'advance', amount: 100 }))[0]!.id;
    const r = await q(ravi, `update requests set status = 'approved' where id = $1 returning id`, [
      id,
    ]);
    expect(r).toEqual([]);
  });
});

describe('no duplicate leave (20261030000001)', () => {
  it('leave overlapping a waiting or approved leave request is refused', async () => {
    // Meena's approved leave is 02/02/2030 – 03/02/2030.
    await rejects(
      ask(meena, shop1, meenaP, { kind: 'leave', from: '2030-02-03', to: '2030-02-04' }),
      /already asked/,
    );
    const waiting = (
      await ask(meena, shop1, meenaP, { kind: 'leave', from: '2030-05-01', to: '2030-05-03' })
    )[0]!.id;
    await rejects(
      ask(meena, shop1, meenaP, { kind: 'leave', from: '2030-04-30', to: '2030-05-01' }),
      /already asked/,
    );
    await q(meena, `update requests set status = 'cancelled' where id = $1`, [waiting]);
    const again = await ask(meena, shop1, meenaP, {
      kind: 'leave',
      from: '2030-05-01',
      to: '2030-05-01',
    });
    expect(again[0]!.status).toBe('pending');
  });

  it('leave on a day already marked as leave is refused; other people are not affected', async () => {
    await q(
      asha,
      `insert into attendance (shop_id, staff_id, date, status) values ($1, $2, '2030-06-10', 'unpaid_leave')`,
      [shop1, selviP],
    );
    await rejects(
      ask(selvi, shop1, selviP, { kind: 'leave', from: '2030-06-09', to: '2030-06-11' }),
      /already asked/,
    );
    const other = await ask(meena, shop1, meenaP, {
      kind: 'leave',
      from: '2030-06-10',
      to: '2030-06-10',
    });
    expect(other[0]!.status).toBe('pending');
  });
});

describe('rejecting an approved request (20261030000001)', () => {
  it('a decider rejects approved leave later; it keeps no leave status', async () => {
    const r = await q<{ status: string; leave_status: string | null }>(
      ravi,
      `update requests set status = 'rejected', decision_note = 'shop is busy' where id = $1
       returning status, leave_status`,
      [leave],
    );
    expect(r[0]).toEqual({ status: 'rejected', leave_status: null });
  });

  it('staff cannot reject their own approved request', async () => {
    const id = (
      await ask(selvi, shop1, selviP, { kind: 'leave', from: '2030-07-01', to: '2030-07-01' })
    )[0]!.id;
    await q(
      ravi,
      `update requests set status = 'approved', leave_status = 'paid_leave' where id = $1`,
      [id],
    );
    await rejects(
      q(selvi, `update requests set status = 'rejected' where id = $1`, [id]),
      /Not allowed to decide/,
    );
  });

  it('an approved advance request is rejected only after its advance is undone', async () => {
    const line = (
      await q<{ id: string }>(
        asha,
        `select l.id from ledger_entries l join requests r on r.advance_id = l.ref_id
         where r.id = $1 and l.ref_table = 'advances'`,
        [advance],
      )
    )[0]!.id;
    await rejects(
      q(ravi, `update requests set status = 'rejected' where id = $1`, [advance]),
      /Undo the advance/,
    );
    await q(
      asha,
      `insert into ledger_entries (shop_id, staff_id, date, type, amount_paise, reverses_id)
       values ($1, $2, '2030-01-11', 'reversal', 200000, $3)`,
      [shop1, meenaP, line],
    );
    const r = await q<{ status: string; advance_id: string | null }>(
      ravi,
      `update requests set status = 'rejected' where id = $1 returning status, advance_id`,
      [advance],
    );
    expect(r[0]).toEqual({ status: 'rejected', advance_id: null });
  });
});
