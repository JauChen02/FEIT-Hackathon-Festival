/**
 * `pnpm admin:process-skills` (ADR-052).
 *
 * Applies `coach/process-session` in-process to every session whose learning
 * events still have no `skill_updates` row.
 *
 * This is the drain for when Inngest is not consuming — a local environment
 * with no dev server, or an outage that `sessions/reconcile` cannot fix because
 * reconcile only re-sends. It runs the same code path the job runs and relies
 * on the same UNIQUE guards, so it is safe to run repeatedly and safe to run
 * while Inngest is healthy.
 *
 * Run with `--conditions=react-server`: the app's server modules import
 * `server-only`, whose default export deliberately throws, and only the
 * `react-server` condition resolves it to the no-op. Next.js applies that
 * condition during a build; a plain Node script has to ask for it.
 */

import '@learnarena/db/loadEnv';
import { runDrainPendingSessions } from '../lib/inngest/functions/coachJobs';

async function main(): Promise<void> {
  const { processed, eventsApplied } = await runDrainPendingSessions();
  console.log(
    processed === 0
      ? 'Nothing pending: every learning event already has a skill update.'
      : `Processed ${processed} session(s), applying ${eventsApplied} Elo update(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
