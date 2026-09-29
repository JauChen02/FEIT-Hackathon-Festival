import { z } from 'zod';
import { ok, route } from '@/lib/api/handler';
import { loadSessionContext } from '@/lib/sessions/context';
import { cancelSession } from '@/lib/sessions/terminate';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * POST /api/sessions/:id/cancel (PLANNING.md §16.2, §8.2).
 *
 * "only from CREATED" — the learner backed out before the first question was
 * served, so the session has no effects at all.
 */
export const POST = route(
  { name: 'POST /api/sessions/:id/cancel', params: paramsSchema },
  async ({ request, requestId, params }) => {
    const { session, now } = await loadSessionContext(request, params.id);
    const result = await cancelSession(session, now);
    return ok({ sessionId: session.id, status: result.status }, requestId);
  },
);
