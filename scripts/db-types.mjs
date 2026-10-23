// Regenerates packages/db/src/database.types.ts from the live Supabase project.
// Needs `pnpm db:login` once, and the project ref from (first match wins):
//   pnpm db:types <ref>  ·  SUPABASE_PROJECT_ID env  ·  SUPABASE_PROJECT_ID=... in root .env
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function projectRef() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.SUPABASE_PROJECT_ID) return process.env.SUPABASE_PROJECT_ID;
  if (existsSync('.env')) {
    const match = readFileSync('.env', 'utf8').match(/^SUPABASE_PROJECT_ID=(\S+)/m);
    if (match) return match[1];
  }
  console.error(
    'Project ref missing. Run `pnpm db:types <ref>` or set SUPABASE_PROJECT_ID in .env',
  );
  process.exit(1);
}

const ref = projectRef();
if (!/^[a-z0-9]{20}$/.test(ref)) {
  console.error(`"${ref}" doesn't look like a Supabase project ref (20 lowercase letters/digits).`);
  process.exit(1);
}

// One command string so it also runs the supabase.cmd shim on Windows; ref is validated above.
const types = execSync(`supabase gen types typescript --project-id ${ref} --schema public`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
writeFileSync('packages/db/src/database.types.ts', types);
console.log('Wrote packages/db/src/database.types.ts');
