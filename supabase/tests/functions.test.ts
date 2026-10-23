import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/** Which functions are reachable through the API, and by whom (migration 20261023000001). */
let db: Db;
let owner: string;

beforeAll(async () => {
  db = await freshDb();
  owner = await createAuthUser(db, 'owner@shop.test');
  await as(db, owner, (tx) => tx.query(`select public.setup_shop('Test Shop', 'Asha')`));
});

const call = (userId: string | null, sql: string) => as(db, userId, (tx) => tx.query(sql));

describe('exposed (public schema) functions', () => {
  it('lists only the functions the apps call', async () => {
    const r = await db.query<{ name: string }>(
      `select p.proname as name from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' order by 1`,
    );
    expect(r.rows.map((x) => x.name)).toEqual([
      'my_permissions',
      'ping',
      'setup_shop',
      'shop_exists',
    ]);
  });

  it('anon can call ping and nothing else', async () => {
    await call(null, 'select public.ping()');
    for (const fn of ['my_permissions()', 'shop_exists()', `setup_shop('a', 'b')`]) {
      await rejects(call(null, `select public.${fn}`), /permission denied/);
    }
  });

  it('signed-in users can call my_permissions and shop_exists', async () => {
    const perms = await call(owner, 'select * from public.my_permissions()');
    expect(perms.rows).toHaveLength(22);
    await call(owner, 'select public.shop_exists()');
  });
});

describe('private helpers', () => {
  it('are not executable by anon', async () => {
    for (const fn of ['has_permission($$staff.view$$)', 'is_owner()', 'current_person_id()']) {
      await rejects(call(null, `select private.${fn}`), /permission denied/);
    }
  });

  it('trigger functions are not executable by signed-in users', async () => {
    for (const fn of ['write_audit', 'protect_owner', 'check_same_shop', 'reject_modification']) {
      const r = await call(
        owner,
        `select has_function_privilege('private.${fn}()', 'execute') as ok`,
      );
      expect(r.rows[0]).toEqual({ ok: false });
    }
  });

  it('still drive RLS and auditing after the move', async () => {
    const names = await call(owner, 'select name from public.people');
    expect(names.rows).toEqual([{ name: 'Asha' }]);
    const audit = await call(owner, `select count(*)::int as n from public.audit_log`);
    expect(audit.rows[0]).toEqual({ n: 2 });
  });
});

describe('default privileges for future functions', () => {
  it('a new public function is not executable by anon or PUBLIC until granted', async () => {
    await db.exec(`create function public.later_fn() returns int language sql as $$ select 1 $$`);
    await rejects(call(null, 'select public.later_fn()'), /permission denied/);
    // authenticated still gets Supabase's default grant
    await call(owner, 'select public.later_fn()');
    await db.exec('drop function public.later_fn()');
  });
});
