/**
 * Sign-ins for helpers (people with roles but no payroll), owner's decision 2026-10-26: email +
 * password. Someone with staff.edit gives a helper their email and a first password; the helper
 * chooses their own at the first sign-in (`must_change_password` on the sign-in). Plain
 * TypeScript with no Deno or npm imports, so tests run it with fake dependencies; `index.ts`
 * wires it to Supabase. The permission check runs as the caller (`helper_login_target`, RLS-style
 * `auth.uid()`); the account changes run with the service role.
 *
 * Requests (POST JSON, with the caller's Authorization header):
 *   { action: 'give', personId, email, password } → { ok, linked: 'new' | 'existing' }
 *   { action: 'reset', personId, password }       → { ok }
 *   { action: 'remove', personId }                → { ok }
 * Refusals are { ok: false, reason }: not_found, no_permission, owner, staff, has_login,
 * no_login, bad_email, password (+ message from Supabase Auth), in_shop, other_shops.
 */

export interface Deps {
  /** An RPC as the person calling (their JWT). */
  asCaller(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  /** An RPC with the service role. */
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  /** A new sign-in that must choose its own password at the first sign-in. */
  createUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
  /** A new first password; the person must choose their own again. */
  resetPassword(id: string, password: string): Promise<string | null>;
  deleteUser(id: string): Promise<string | null>;
}

export type Reply = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { ok: true, ...body },
});
const refuse = (reason: string, extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { ok: false, reason, ...extra },
});
const bad = (message: string): Reply => ({
  status: 400,
  body: { ok: false, reason: 'bad_request', message },
});
const fail = (message: string): Reply => ({
  status: 500,
  body: { ok: false, reason: 'server', message },
});

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
// Enough to catch typos; Supabase Auth checks the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Target = {
  ok: boolean;
  reason?: string;
  personId?: string;
  shopId?: string;
  authUserId?: string | null;
  email?: string | null;
  otherShops?: number;
};

async function call<T>(
  fn: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await fn(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

export async function handle(body: unknown, deps: Deps): Promise<Reply> {
  if (!body || typeof body !== 'object') return bad('JSON body expected');
  const b = body as Record<string, unknown>;
  if (!isText(b.personId)) return bad('personId is required');
  const personId = b.personId;

  try {
    const target = await call<Target>(deps.asCaller, 'helper_login_target', {
      p_person: personId,
    });
    if (!target.ok) return refuse(target.reason ?? 'not_found');

    switch (b.action) {
      case 'give': {
        if (target.authUserId) return refuse('has_login');
        if (!isText(b.email) || !EMAIL.test(b.email.trim())) return refuse('bad_email');
        const email = b.email.trim().toLowerCase();
        const existing = await call<string | null>(deps.rpc, 'auth_user_by_email', {
          p_email: email,
        });
        if (existing) {
          // Already signs in elsewhere (another shop): link it, their password stays theirs.
          const { error } = await deps.rpc('helper_login_link', {
            p_person: personId,
            p_user: existing,
            p_email: email,
          });
          if (error) return refuse('in_shop');
          return ok({ linked: 'existing' });
        }
        if (!isText(b.password)) return refuse('password', { message: '' });
        const made = await deps.createUser(email, b.password);
        if ('error' in made) return refuse('password', { message: made.error });
        await call(deps.rpc, 'helper_login_link', {
          p_person: personId,
          p_user: made.id,
          p_email: email,
        });
        return ok({ linked: 'new' });
      }
      case 'reset': {
        if (!target.authUserId) return refuse('no_login');
        if ((target.otherShops ?? 0) > 0) return refuse('other_shops');
        if (!isText(b.password)) return refuse('password', { message: '' });
        const err = await deps.resetPassword(target.authUserId, b.password);
        if (err) return refuse('password', { message: err });
        return ok();
      }
      case 'remove': {
        if (!target.authUserId) return refuse('no_login');
        await call(deps.rpc, 'helper_login_link', {
          p_person: personId,
          p_user: null,
          p_email: null,
        });
        // The sign-in goes too, unless it is used in another shop.
        if ((target.otherShops ?? 0) === 0) {
          const err = await deps.deleteUser(target.authUserId);
          if (err) return fail(err);
        }
        return ok();
      }
      default:
        return bad('action must be give, reset or remove');
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}
