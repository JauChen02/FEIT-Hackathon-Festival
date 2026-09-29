import { z } from 'zod';
import { ok, route } from '@/lib/api/handler';
import { loadSessionContext } from '@/lib/sessions/context';
import { abandonSession } from '@/lib/sessions/terminate';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * POST /api/sessions/:id/abandon (PLANNING.md §16.2, §8.2).
 *
 * "idempotent if already ABANDONED". Submitted answers and their learning
 * events are kept; no points, no streak credit.
 */
export const POST = route(
  { name: 'POST /api/sessions/:id/abandon', params: paramsSchema },
  async ({ request, requestId, params }) => {
    const { session, now } = await loadSessionContext(request, params.id);
    const result = await abandonSession(session, now);
    return ok({ sessionId: session.id, status: result.status }, requestId);
  },
);
