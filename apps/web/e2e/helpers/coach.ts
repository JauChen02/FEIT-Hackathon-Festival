import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Stand in for the Inngest runtime (ADR-052).
 *
 * The E2E suite boots `next start` and the real Supabase stack, but not an
 * Inngest dev server — so `session/terminal` is sent and nothing consumes it,
 * and the Elo updates in `coach/process-session` never land.
 *
 * Rather than mock the Coach, the test plays the part Inngest would: it runs
 * the very same `runProcessSession` through the `admin:process-skills` drain.
 * Everything the assertions then read — `skill_profiles`, `skill_updates`, the
 * derived proficiency on screen — is produced by the production code path.
 */
export async function drainCoachJobs(): Promise<void> {
  await run('pnpm', ['admin:process-skills'], {
    cwd: webRoot,
    env: process.env,
    timeout: 60_000,
  });
}
