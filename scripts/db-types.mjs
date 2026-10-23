// Regenerates packages/db/src/database.types.ts from the live Supabase project.
// Needs `pnpm db:login` once, and the project ref from (first match wins):
//   pnpm db:types <ref>  ·  SUPABASE_PROJECT_ID env  ·  SUPABASE_PROJECT_ID=... in root .env
import { execFileSync } from 'node:child_process';
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

const types = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--project-id', projectRef(), '--schema', 'public'],
  { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] },
);
writeFileSync('packages/db/src/database.types.ts', types);
console.log('Wrote packages/db/src/database.types.ts');
