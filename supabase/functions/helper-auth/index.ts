// Supabase Edge Function (Deno): sign-ins for helpers (email + password).
// The logic is in handler.ts (tested in supabase/tests/helper-auth.test.ts); this file only
// connects it to Supabase. The caller's own JWT is used for the permission check; the service
// role (never leaves the server) makes, resets and removes the sign-in.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type Deps } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const secret =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default!;
const publishable =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>)
    .default!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, reason: 'no_permission' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const caller = createClient(url, publishable, {
    ...options,
    global: { headers: { Authorization: authorization } },
  });

  const deps: Deps = {
    asCaller: async (fn, args) => {
      const { data, error } = await caller.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    createUser: async (email, password) => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });
      return error || !data.user ? { error: error?.message ?? 'no user' } : { id: data.user.id };
    },
    resetPassword: async (id, password) => {
      const { error } = await admin.auth.admin.updateUserById(id, {
        password,
        user_metadata: { must_change_password: true },
      });
      return error?.message ?? null;
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      return error?.message ?? null;
    },
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const reply = await handle(body, deps);
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
