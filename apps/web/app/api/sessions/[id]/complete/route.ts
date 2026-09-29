import { z } from 'zod';
import { ok, route } from '@/lib/api/handler';
import { loadSessionContext } from '@/lib/sessions/context';
import { completeSession } from '@/lib/sessions/completeSession';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * POST /api/sessions/:id/complete (PLANNING.md §16.2, §18.2).
 *
 *   → {pointsBreakdown, finalPoints, streak, recommendationCompleted,
 *      review:[missed questions with explanations]}   idempotent
 *
 * §16.3: calling this on an already-COMPLETED session returns `200` with the
 * stored `result_json` and writes nothing.
 */
export const POST = route(
  { name: 'POST /api/sessions/:id/complete', params: paramsSchema },
  async ({ request, requestId, params }) => {
    const { user, session, now } = await loadSessionContext(request, params.id);
    const { result } = await completeSession(user, session.id, now);

    return ok(
      {
        sessionId: result.sessionId,
        finalPoints: result.finalPoints,
        pointsBreakdown: result.pointsBreakdown,
        streak: result.streak,
        recommendationCompleted: result.recommendationCompleted,
        // §11.7 / §11.8: why the weakness multiplier took its value.
        weakness: result.weakness,
        review: result.review,
        accuracy: result.accuracy,
        correctCount: result.correctCount,
        questionCount: result.questionCount,
        isQualifying: result.isQualifying,
      },
      requestId,
    );
  },
);
