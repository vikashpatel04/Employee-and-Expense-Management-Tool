# Working from another computer

How to pick up FinCrew + Staffora on a second PC (for example the owner's personal PC) and come
back again without losing anything. Everything a new Claude session needs is in the repo:
`CLAUDE.md` (house rules and owner rules), then `docs/PROGRESS.md` → **Start here**.

## Before leaving this PC

1. Commit everything (`git status` must be clean).
2. **Push** `main` (`git push`) so the other PC gets the latest docs and code.
3. Note anything half-done in `docs/PROGRESS.md` → Start here (Claude does this when asked to
   "save progress").

## First time on the other PC

1. **Tools**: Git, Node 22+ (this project uses Node 24), pnpm 10 (`corepack enable`), the GitHub
   CLI (`gh`), and the Claude desktop app. No Docker, Java or Android SDK needed.
2. **Clone and install**:

   ```bash
   gh auth login
   gh auth refresh -s workflow
   gh auth setup-git
   git clone https://github.com/vikashpatel04/Employee-and-Expense-Management-Tool.git
   cd Employee-and-Expense-Management-Tool
   git config user.name "Vikash Patel"
   pnpm install
   ```

   The `workflow` scope is needed to push changes to `.github/workflows`.

3. **Env files** (git-ignored; only public values, never the secret / service-role key). Copy
   each `.env.example` and fill it in:

   | File                              | Values                                                             |
   | --------------------------------- | ------------------------------------------------------------------ |
   | `.env`                            | `SUPABASE_PROJECT_ID=ufmlqvvfznemghmnvynz`                         |
   | `apps/fincrew-web/.env.local`     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `apps/fincrew-mobile/.env.local`  | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `apps/staffora-mobile/.env.local` | same two `EXPO_PUBLIC_…` values                                    |

   URL: `https://ufmlqvvfznemghmnvynz.supabase.co`. Publishable key: Supabase dashboard →
   project → Settings → API Keys → publishable (`sb_publishable_…`). Or copy the three
   `.env.local` files and `.env` from the first PC on a USB stick / private note.

4. **Supabase CLI** (for live database checks and `pnpm db:types`): `pnpm exec supabase login`
   (opens the browser; the owner signs in). If a command asks for the database password, the
   owner types it; never paste it into chat.
5. **Check it works**: `pnpm typecheck` and `pnpm test` (see Start here → How to check work for
   the expected counts).
6. **Open the folder in the Claude desktop app** (Code tab) and say: _"Read CLAUDE.md and
   docs/PROGRESS.md Start here, then continue."_ The previews in `.claude/launch.json` come with
   the repo.

## What does not carry over

- **Claude's memory** is per computer. Everything it held is also written in `CLAUDE.md` (Owner
  rules) and `docs/PROGRESS.md`, so nothing is lost.
- **Sign-ins in the preview browser**: the owner signs in to the FinCrew website / app again on
  the new PC (their own password).
- **Staffora as Test Staff**: the sign-in is tied to one browser (its device id). On another
  PC: website staff page → Staffora sign-in → **New phone** (and **Reset PIN** if needed),
  then the owner types Test Staff's phone number in Staffora and the PIN. Doing the same
  again moves it back.
- Claude Design canvases and the live website / database are online, the same from any PC.

## Every time you switch computers

- **Start**: `git pull` before asking Claude to work.
- **Stop**: commit, then push (the owner pushes, or tells Claude to push).
- Work on one computer at a time. If both have unpushed commits, pull with
  `git pull --rebase` and fix any conflicts before going on (docs files conflict most).
- Migrations: new files need a later timestamp than the newest one on `main`; pull first so
  two computers don't pick the same one.
