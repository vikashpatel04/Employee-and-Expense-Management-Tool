/**
 * Staff sign-in to Staffora with the phone number FinCrew has for them and a 4-digit PIN they
 * choose the first time (docs/DECISIONS.md, 2026-10-25). Plain TypeScript with no Deno or npm
 * imports, so the tests run it with fake dependencies; `index.ts` wires it to Supabase. Rules
 * live in the database (`phone_lookup`, `pin_setup`, `pin_login`); this only turns a first PIN or
 * a PIN into a normal Supabase session, so RLS works on `auth.uid()`. Each staff sign-in has a
 * server-only email and a password nobody keeps: a new random one is set before each sign-in.
 *
 * Requests (POST JSON):
 *   { action: 'lookup', phone }                  → { ok, personId, firstName, shopName, hasPin }
 *   { action: 'setup', phone, pin, deviceId }    → { ok, personId, shopId, session }
 *   { action: 'login', personId, pin, deviceId } → { ok, personId, shopId, session }
 * Refusals are { ok: false, reason } (not_found, left, many, bad_pin, has_pin, wrong_pin, …).
 */

export type Session = { access_token: string; refresh_token: string; expires_at?: number };

export interface Deps {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  /** Make the sign-in for a person; returns its id. */
  createUser(email: string): Promise<{ id: string } | { error: string }>;
  getUserEmail(id: string): Promise<string | null>;
  setPassword(id: string, password: string): Promise<string | null>;
  signIn(email: string, password: string): Promise<{ session: Session } | { error: string }>;
  randomPassword(): string;
}

export type Reply = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body: { ok: true, ...body } });
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

const isText = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min;
const PIN = /^\d{4}$/;

/** Server-only address for a person's sign-in (never shown, never mailed). */
export const staffEmail = (personId: string) => `staff-${personId}@fincrew.invalid`;

async function call<T>(deps: Deps, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await deps.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** A fresh session for this sign-in. */
async function session(deps: Deps, userId: string): Promise<Session | string> {
  const email = await deps.getUserEmail(userId);
  if (!email) return 'sign-in not found';
  const password = deps.randomPassword();
  const err = await deps.setPassword(userId, password);
  if (err) return err;
  const r = await deps.signIn(email, password);
  return 'session' in r ? r.session : r.error;
}

type Lookup = {
  ok: boolean;
  reason?: string;
  personId?: string;
  shopId?: string;
  firstName?: string;
  shopName?: string;
  hasPin?: boolean;
  authUserId?: string | null;
};
type Login = {
  ok: boolean;
  reason?: string;
  authUserId?: string;
  shopId?: string;
  retryAt?: string;
  triesLeft?: number;
};

export async function handle(body: unknown, deps: Deps): Promise<Reply> {
  if (!body || typeof body !== 'object') return bad('JSON body expected');
  const b = body as Record<string, unknown>;
  try {
    switch (b.action) {
      case 'lookup': {
        if (!isText(b.phone)) return bad('phone');
        const r = await call<Lookup>(deps, 'phone_lookup', { p_phone: b.phone });
        return r.ok
          ? ok({
              personId: r.personId,
              firstName: r.firstName,
              shopName: r.shopName,
              hasPin: r.hasPin,
            })
          : refuse(r.reason ?? 'not_found');
      }

      case 'setup': {
        if (!isText(b.phone)) return bad('phone');
        if (!isText(b.deviceId, 8)) return bad('deviceId');
        if (typeof b.pin !== 'string' || !PIN.test(b.pin)) return refuse('bad_pin');
        const r = await call<Lookup>(deps, 'phone_lookup', { p_phone: b.phone });
        if (!r.ok) return refuse(r.reason ?? 'not_found');
        if (r.hasPin) return refuse('has_pin');
        let userId = r.authUserId ?? null;
        if (!userId) {
          const made = await deps.createUser(staffEmail(r.personId!));
          if ('error' in made) return fail(made.error);
          userId = made.id;
        }
        const a = await call<Lookup>(deps, 'pin_setup', {
          p_phone: b.phone,
          p_pin: b.pin,
          p_device: b.deviceId,
          p_auth_user: userId,
        });
        if (!a.ok) return refuse(a.reason ?? 'not_found');
        const s = await session(deps, userId);
        if (typeof s === 'string') return fail(s);
        return ok({ personId: a.personId, shopId: a.shopId, session: s });
      }

      case 'login': {
        if (!isText(b.personId)) return bad('personId');
        if (!isText(b.deviceId, 8)) return bad('deviceId');
        if (typeof b.pin !== 'string') return bad('pin');
        const r = await call<Login>(deps, 'pin_login', {
          p_person: b.personId,
          p_pin: b.pin,
          p_device: b.deviceId,
        });
        if (!r.ok) {
          const extra: Record<string, unknown> = {};
          if (r.retryAt) extra.retryAt = r.retryAt;
          if (r.triesLeft !== undefined) extra.triesLeft = r.triesLeft;
          return refuse(r.reason ?? 'wrong_pin', extra);
        }
        const s = await session(deps, r.authUserId!);
        if (typeof s === 'string') return fail(s);
        return ok({ personId: b.personId, shopId: r.shopId, session: s });
      }

      default:
        return bad('action must be lookup, setup or login');
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
