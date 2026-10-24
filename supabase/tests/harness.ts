/**
 * Runs the real migrations on PGlite (in-process Postgres) with a minimal stand-in
 * for Supabase's `auth` schema and API roles, so RLS can be tested without Docker.
 *
 * `as(user)` switches to the `authenticated` role with that user's JWT subject,
 * exactly how PostgREST runs queries on Supabase.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Storage: just the parts migrations use (buckets, objects with RLS, foldername).
  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    owner_id text,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant select on storage.buckets to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare parts text[] := string_to_array(name, '/');
  begin
    return parts[1:array_length(parts, 1) - 1];
  end;
  $$;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function freshDb(): Promise<Db> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

export async function createAuthUser(db: Db, email: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return id;
}

/** Run `fn` inside a transaction as a signed-in user (or anon when userId is null). */
export async function as<T>(
  db: Db,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    return fn(tx);
  });
}

/** Expect `promise` to reject with a Postgres error whose message matches. */
export async function rejects(promise: Promise<unknown>, match: RegExp): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!match.test(message)) throw new Error(`Expected error ${match}, got: ${message}`);
    return;
  }
  throw new Error(`Expected error ${match}, but it succeeded`);
}
