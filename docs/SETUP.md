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

### Edge functions

The CI **migrate** job also deploys the edge functions after the migrations
(`supabase functions deploy staff-auth --use-api --no-verify-jwt`, bundled on Supabase's side, no
Docker). They read `SUPABASE_URL` and the service role key from their own environment on
Supabase — nothing to set by hand. To deploy one by hand: `pnpm exec supabase functions deploy
staff-auth --project-ref <ref> --use-api --no-verify-jwt`.

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
   The function region comes from `apps/fincrew-web/vercel.json` (`bom1`, Mumbai): keep it next
   to the Supabase project's region (`ap-south-1`), or every page is slow.
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Redeploy so the variables take effect.
4. In Supabase **Authentication → URL Configuration**, set Site URL to the Vercel URL; keep
   `http://localhost:3000` in Redirect URLs.

Secrets rule: the **service role key** never goes in app code, Vercel or GitHub; only in Supabase
edge function secrets (PLAN §9).

## 6. Android app (FinCrew)

1. Copy `apps/fincrew-mobile/.env.example` to `apps/fincrew-mobile/.env.local` and fill in the
   same public Supabase URL and publishable key as the website (never the secret key).
2. `pnpm --filter @fincrew/mobile web` runs the app in a browser at phone size;
   `pnpm --filter @fincrew/mobile start` runs the Expo dev server for a phone or emulator.
3. Real Android builds use EAS (Expo's cloud build) and need your Expo account — to be set up
   when the app is ready to install. The Android package id (`app.fincrew.mobile`) can still
   change until then.

## 7. Staffora app (staff)

`apps/staffora-mobile` works like the FinCrew app (section 6): copy `.env.example` to
`.env.local` with the same two public values, then run it in a browser with the
"staffora-mobile-web" preview (port 8082) or `pnpm --filter @fincrew/staffora web`. Signing in
uses the phone number saved for the staff member in FinCrew (staff details): type it on the
Welcome screen and choose a PIN. Forgot it → staff page → Staffora sign-in → Reset PIN. Feature doc: `docs/features/staffora.md`.
