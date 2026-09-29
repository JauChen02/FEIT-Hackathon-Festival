import { consistencyCheck } from '@/lib/inngest/functions/consistencyJobs';
import { privacyFunctions } from '@/lib/inngest/functions/privacyJobs';
import { engagementFunctions } from '@/lib/inngest/functions/engagementJobs';
import { leaderboardFunctions } from '@/lib/inngest/functions/leaderboardJobs';
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { coachFunctions } from '@/lib/inngest/functions/coachJobs';
import { sessionFunctions } from '@/lib/inngest/functions/sessionJobs';

/**
 * The Inngest endpoint (PLANNING.md §21.1, §18.3).
 *
 * Inngest invokes registered functions by calling back into this route, so
 * every job runs in the same process, with the same database handle and the
 * same logging as the request path.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...sessionFunctions,
    ...coachFunctions,
    ...leaderboardFunctions,
    ...engagementFunctions,
    ...privacyFunctions,
    consistencyCheck,
  ],
});
