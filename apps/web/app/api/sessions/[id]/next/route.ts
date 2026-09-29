import { z } from 'zod';
import { ok, route } from '@/lib/api/handler';
import { loadSessionContext } from '@/lib/sessions/context';
import { serveNextQuestion } from '@/lib/sessions/serveNext';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * POST /api/sessions/:id/next (PLANNING.md §16.2, §8.1).
 *
 * "serve next question (idempotent: returns the currently open question if one
 *  is open) → {position, question:{id, prompt, type, options}, deadlineAt}
 *  **(no answer data)**"
 *
 * The payload is built by `toServedQuestion`, which projects away `answer_json`
 * and `explanation` (Invariant 1).
 */
export const POST = route(
  { name: 'POST /api/sessions/:id/next', params: paramsSchema },
  async ({ request, requestId, params }) => {
    const { session, now } = await loadSessionContext(request, params.id);
    return ok(await serveNextQuestion(session, now), requestId);
  },
);
