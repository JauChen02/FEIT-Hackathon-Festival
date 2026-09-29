/**
 * `pnpm admin:backfill-skills` (ADR-051).
 *
 * Phase 1 stamped `post_processed_at` with a stub consumer (ADR-043), so
 * sessions played before Phase 3 carry learning events with no `skill_updates`
 * rows and therefore contributed nothing to any rating.
 *
 * This finds them and re-sends `session/terminal`, which `coach/process-session`
 * picks up. Safe to run repeatedly: `skill_updates.learning_event_id` is UNIQUE
 * (§18.1), so an event that was already applied is simply skipped.
 *
 * Run with `--conditions=react-server`: the app's server modules import
 * `server-only`, whose default export deliberately throws, and only the
 * `react-server` condition resolves it to the no-op. Next.js applies that
 * condition during a build; a plain Node script has to ask for it.
 */

import '@learnarena/db/loadEnv';
import { runBackfillSkillUpdates } from '../lib/inngest/functions/coachJobs';

async function main(): Promise<void> {
  const { resent } = await runBackfillSkillUpdates();
  console.log(
    resent === 0
      ? 'Nothing to backfill: every learning event already has a skill update.'
      : `Re-sent session/terminal for ${resent} session(s). Run the Inngest dev server to process them.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
