// Supabase Edge Function (Deno): staff sign-in with an invite link and a PIN.
// The logic is in handler.ts (tested in supabase/tests/staff-auth.test.ts); this file only
// connects it to Supabase with the service role, which never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle, type Deps } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const key =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);

const deps: Deps = {
  rpc: async (fn, args) => {
    const { data, error } = await admin.rpc(fn, args);
    return { data, error: error ? { message: error.message } : null };
  },
  createUser: async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    return error || !data.user ? { error: error?.message ?? 'no user' } : { id: data.user.id };
  },
  getUserEmail: async (id) => {
    const { data } = await admin.auth.admin.getUserById(id);
    return data.user?.email ?? null;
  },
  setPassword: async (id, password) => {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    return error?.message ?? null;
  },
  signIn: async (email, password) => {
    // A separate client so the admin client never carries a user's session.
    const { data, error } = await createClient(url, key, options).auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) return { error: error?.message ?? 'no session' };
    const s = data.session;
    return {
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
      },
    };
  },
  randomPassword: () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
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
