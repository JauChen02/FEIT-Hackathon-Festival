import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const run = (args) => execFileSync('pnpm', args, { stdio: 'inherit' });
let status;
try {
  status = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
} catch {
  run(['supabase', 'start']);
  status = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}
let env = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
function setMissing(key, value) {
  const pattern = new RegExp(`^${key}=([^\\n]*)$`, 'm');
  const existing = env.match(pattern);
  if (existing && existing[1].trim()) return;
  if (existing) env = env.replace(pattern, `${key}=${value}`);
  else env += `\n${key}=${value}`;
}
setMissing('APP_ENV', 'local');
setMissing('DATABASE_URL', status.DB_URL);
setMissing('NEXT_PUBLIC_SUPABASE_URL', status.API_URL);
setMissing('NEXT_PUBLIC_SUPABASE_ANON_KEY', status.ANON_KEY);
setMissing('SUPABASE_SERVICE_ROLE_KEY', status.SERVICE_ROLE_KEY);
setMissing('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
setMissing('NEXT_PUBLIC_REALTIME_URL', 'http://localhost:3001');
setMissing('REALTIME_TOKEN_SECRET', randomBytes(32).toString('hex'));
setMissing('UPSTASH_REDIS_REST_URL', 'http://localhost:8079');
setMissing('UPSTASH_REDIS_REST_TOKEN', 'learnarena-local-only');
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const keys = require('web-push').generateVAPIDKeys();
setMissing('NEXT_PUBLIC_VAPID_PUBLIC_KEY', keys.publicKey);
setMissing('VAPID_PRIVATE_KEY', keys.privateKey);
setMissing('VAPID_SUBJECT', 'mailto:demo@example.com');
writeFileSync('.env.local', env + '\n', { mode: 0o600 });
execFileSync('docker', ['compose', '-f', 'compose.services.yml', 'up', '-d'], { stdio: 'inherit' });
run(['db:migrate']);
run(['db:seed']);
for (const offset of [-1, 0, 1])
  run([
    'admin:daily-challenge',
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10),
  ]);
console.log(
  'Ready. Run pnpm dev (or pnpm build && pnpm start). Local sign-in email appears at http://127.0.0.1:54324.',
);
