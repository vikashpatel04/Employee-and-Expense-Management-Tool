import { beforeAll, describe, expect, it } from 'vitest';
import { as, createAuthUser, freshDb, rejects, type Db } from './harness';

/**
 * Staff documents (migration 20261026000002). Asha owns Shop 1 and Shop 2.
 *   Ravi:  Shop 1 "Manager": staff.view, staff.edit.
 *   Priya: Shop 1 "Viewer": staff.view only.
 *   Meena, Selvi: Shop 1 staff (logins, no roles).   Kiran: Shop 2 staff (login).
 * Tests run in order.
 */
let db: Db;
let asha: string, ravi: string, priya: string, meena: string, selvi: string, kiran: string;
let shop1: string, shop2: string;
let ashaP: string, meenaP: string, selviP: string, kiranP: string;
let meenaDoc: string;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const add = (
  user: string,
  d: { shop?: string; staff: string; name?: string; path: string; mime?: string },
) =>
  q<{ id: string; uploaded_by: string }>(
    user,
    `insert into staff_documents (shop_id, staff_id, name, file_path, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, 1234) returning id, uploaded_by`,
    [d.shop ?? shop1, d.staff, d.name ?? 'Aadhaar card', d.path, d.mime ?? 'image/jpeg'],
  );
const docsSeen = async (user: string) =>
  (await q<{ name: string }>(user, 'select name from staff_documents order by name')).map(
    (r) => r.name,
  );

beforeAll(async () => {
  db = await freshDb();
  [asha, ravi, priya, meena, selvi, kiran] = (await Promise.all(
    ['asha', 'ravi', 'priya', 'meena', 'selvi', 'kiran'].map((x) =>
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
    ashaP = (
      await tx.query<{ id: string }>('select id from people where shop_id = $1 and is_owner', [
        shop1,
      ])
    ).rows[0]!.id;
    const person = async (shop: string, user: string, name: string) =>
      (
        await tx.query<{ id: string }>(
          'insert into people (shop_id, auth_user_id, name) values ($1, $2, $3) returning id',
          [shop, user, name],
        )
      ).rows[0]!.id;
    const raviP = await person(shop1, ravi, 'Ravi');
    const priyaP = await person(shop1, priya, 'Priya');
    meenaP = await person(shop1, meena, 'Meena');
    selviP = await person(shop1, selvi, 'Selvi');
    kiranP = await person(shop2, kiran, 'Kiran');
    for (const [shop, p] of [
      [shop1, meenaP],
      [shop1, selviP],
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
    await role('Manager', ['staff.view', 'staff.edit'], raviP);
    await role('Viewer', ['staff.view'], priyaP);
  });
});

describe('staff_documents', () => {
  it('the owner adds a document; who added it is stamped, not taken from the request', async () => {
    const [row] = await add(asha, { staff: meenaP, path: `${shop1}/${meenaP}/a.jpg` });
    meenaDoc = row!.id;
    expect(row!.uploaded_by).toBe(ashaP);
    const audit = await q(asha, `select 1 from audit_log where table_name = 'staff_documents'`);
    expect(audit.length).toBeGreaterThan(0);
  });

  it('staff.edit adds; staff.view only reads', async () => {
    await add(ravi, {
      staff: selviP,
      name: 'PAN card',
      path: `${shop1}/${selviP}/b.pdf`,
      mime: 'application/pdf',
    });
    await rejects(
      add(priya, { staff: selviP, path: `${shop1}/${selviP}/c.jpg` }),
      /row-level security/,
    );
    expect(await docsSeen(priya)).toEqual(['Aadhaar card', 'PAN card']);
  });

  it('staff see their own documents only', async () => {
    expect(await docsSeen(meena)).toEqual(['Aadhaar card']);
    expect(await docsSeen(selvi)).toEqual(['PAN card']);
  });

  it('another shop sees nothing and adds nothing here (cross-shop isolation)', async () => {
    expect(await docsSeen(kiran)).toEqual([]);
    await rejects(
      add(kiran, { staff: meenaP, path: `${shop1}/${meenaP}/x.jpg` }),
      /row-level security/,
    );
    // A document can't point at another shop's staff member.
    await rejects(
      add(asha, { shop: shop1, staff: kiranP, path: `${shop1}/${kiranP}/y.jpg` }),
      /foreign key/,
    );
  });

  it('only photos and PDFs, with a name', async () => {
    await rejects(
      add(asha, { staff: meenaP, path: `${shop1}/${meenaP}/z.doc`, mime: 'application/msword' }),
      /check constraint/,
    );
    await rejects(
      add(asha, { staff: meenaP, name: '  ', path: `${shop1}/${meenaP}/w.jpg` }),
      /check constraint/,
    );
  });

  it('renaming and removing need staff.edit', async () => {
    expect(
      await q(priya, `update staff_documents set name = 'X' where id = $1 returning id`, [
        meenaDoc,
      ]),
    ).toEqual([]);
    expect(
      (
        await q(ravi, `update staff_documents set name = 'Aadhaar' where id = $1 returning id`, [
          meenaDoc,
        ])
      ).length,
    ).toBe(1);
    expect(
      await q(meena, `delete from staff_documents where id = $1 returning id`, [meenaDoc]),
    ).toEqual([]);
  });
});

describe('document files (storage)', () => {
  const upload = (user: string, path: string) =>
    q(
      user,
      `insert into storage.objects (bucket_id, name, owner_id) values ('staff-docs', $1, $2) returning id`,
      [path, user],
    );
  const readable = async (user: string, path: string) =>
    (await q(user, `select name from storage.objects where name = $1`, [path])).length === 1;

  it('the bucket is private', async () => {
    expect(await q(asha, `select public from storage.buckets where id = 'staff-docs'`)).toEqual([
      { public: false },
    ]);
  });

  it('staff.edit uploads into its own shop only', async () => {
    await upload(ravi, `${shop1}/${meenaP}/a.jpg`);
    await rejects(upload(ravi, `${shop2}/${kiranP}/a.jpg`), /row-level security/);
    await rejects(upload(priya, `${shop1}/${meenaP}/p.jpg`), /row-level security/);
    await rejects(upload(meena, `${shop1}/${meenaP}/m.jpg`), /row-level security/);
  });

  it('a file is readable by whoever can see its document', async () => {
    const path = `${shop1}/${meenaP}/a.jpg`;
    expect(await readable(ravi, path)).toBe(true); // uploader, and staff.view
    expect(await readable(priya, path)).toBe(true); // staff.view
    expect(await readable(meena, path)).toBe(true); // her own document
    expect(await readable(selvi, path)).toBe(false);
    expect(await readable(kiran, path)).toBe(false);
  });

  it('removing a file needs staff.edit', async () => {
    const path = `${shop1}/${meenaP}/a.jpg`;
    expect(
      await q(priya, `delete from storage.objects where name = $1 returning id`, [path]),
    ).toEqual([]);
    expect(
      (await q(ravi, `delete from storage.objects where name = $1 returning id`, [path])).length,
    ).toBe(1);
  });
});
