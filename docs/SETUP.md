# Setup

Everything here is free tier. Do the steps once, in order.

## 0. Local

```bash
pnpm install
pnpm test
```

Node 22+ and pnpm 10 (`corepack enable`). No Docker needed: database tests run on PGlite.

## 1. Supabase project

1. Create a project at supabase.com (region: Mumbai `ap-south-1`). Save the database password.
2. **Auth → Sign In / Providers**: turn **off** "Allow new users to sign up". Only you create logins.
3. Link and push the schema from the repo root:
   ```bash
   pnpm --filter @fincrew/supabase exec supabase login
   pnpm --filter @fincrew/supabase exec supabase link --project-ref <your-ref> --workdir ..
   pnpm --filter @fincrew/supabase exec supabase db push --workdir ..
   ```
4. **Auth → Users → Add user**: create your owner login (email + strong password, auto-confirm).
5. Generate types: `pnpm --filter @fincrew/db gen:types`.

## 2. Website on your machine

```bash
cp apps/fincrew-web/.env.example apps/fincrew-web/.env.local
# fill in values from Supabase → Project Settings → API (URL + publishable key)
pnpm --filter @fincrew/web dev
```

Open http://localhost:3000, sign in, and fill in **Set up your shop**. You are now the owner.
Shop setup works only once.

## 3. GitHub

1. Create the repository and push (you do the pushing).
2. **Settings → Secrets and variables → Actions**, add:
   - `SUPABASE_URL` — e.g. `https://abcd.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`
3. **Actions → Keep Supabase awake → Run workflow** once to check it works.

## 4. Vercel

1. Import the GitHub repo. **Root directory:** `apps/fincrew-web` (Vercel detects pnpm + Turborepo).
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. In Supabase **Auth → URL Configuration**, set Site URL to the Vercel URL.

Secrets rule: the **service role key** never goes in app code or Vercel env; only in Supabase
edge function secrets (PLAN §9).
