# Setup

Everything here is free tier. Do the steps once, in order.

## 0. Local

```bash
pnpm install
pnpm test
```

Node 22+ and pnpm 10 (`corepack enable`). No Docker needed: database tests run on PGlite.

## 1. Supabase project

1. Create a project at supabase.com (region: **South Asia (Mumbai)**). Generate a database
   password and keep it in your password manager.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
   Only you create logins.
3. Note the **project ref**: the `abcd…` in `supabase.com/dashboard/project/abcd…`.
4. **Account → Access Tokens**: generate a token named `github-actions`. Copy it once; it's
   shown only once.

You don't push migrations from your machine. GitHub Actions does it (step 2).

## 2. GitHub (migrations apply automatically)

1. Create the repository (MIT licence is already in the repo, so don't add one in GitHub's form).
2. **Settings → Secrets and variables → Actions → New repository secret**, add all five:

   | Secret                     | Value                                         | Used by     |
   | -------------------------- | --------------------------------------------- | ----------- |
   | `SUPABASE_ACCESS_TOKEN`    | the access token from step 1.4                | migrate job |
   | `SUPABASE_PROJECT_ID`      | project ref                                   | migrate job |
   | `SUPABASE_DB_PASSWORD`     | database password                             | migrate job |
   | `SUPABASE_URL`             | `https://<ref>.supabase.co`                   | keep-awake  |
   | `SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → publishable key | keep-awake  |

3. Push `main`. The **CI** workflow runs typecheck, tests and build, then the **migrate** job
   applies new files in `supabase/migrations/` to the live database.
4. **Actions → Keep Supabase awake → Run workflow** once to check it works.

How migrations flow: add a new file in `supabase/migrations/` → push → CI tests it on PGlite →
`supabase db push` applies it. A migration already on `main` is applied and must never change;
CI fails if one is edited, deleted, renamed, or if a new one has an older timestamp
(`scripts/check-migrations.sh`).

## 3. Owner login and shop

1. **Authentication → Users → Add user → Create new user**: your email + a strong password,
   tick auto-confirm.
2. Run the website locally:
   ```bash
   cp apps/fincrew-web/.env.example apps/fincrew-web/.env.local
   # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   pnpm --filter @fincrew/web dev
   ```
3. Open http://localhost:3000, sign in, fill in **Set up your shop**. You're now the owner.
   Shop setup works only once.

## 4. Database types

```bash
pnpm db:login                 # once; opens the browser
cp .env.example .env          # set SUPABASE_PROJECT_ID=<ref>
pnpm db:types                 # after every new migration
```

## 5. Vercel

1. Import the GitHub repo. **Root directory:** `apps/fincrew-web` (Vercel detects pnpm + Turborepo).
   Skip the suggested **Supabase integration**: it may create a new project, injects the
   service-role key, and uses different variable names.
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Redeploy so the variables take effect.
4. In Supabase **Authentication → URL Configuration**, set Site URL to the Vercel URL; keep
   `http://localhost:3000` in Redirect URLs.

Secrets rule: the **service role key** never goes in app code, Vercel or GitHub; only in Supabase
edge function secrets (PLAN §9).
