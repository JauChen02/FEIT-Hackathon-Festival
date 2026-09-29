import { rateLimit } from '@/lib/security/rateLimit';
import { activityForSession, resolveActivity } from '@learnarena/db';
import { db } from '@/lib/db';
import { z } from 'zod';
import { submitAnswerSchema } from '@learnarena/core';
import { ok, route } from '@/lib/api/handler';
import { loadSessionContext } from '@/lib/sessions/context';
import { submitAnswer } from '@/lib/sessions/submitAnswer';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * POST /api/sessions/:id/answer (PLANNING.md §16.2, §8.2, §16.3).
 *
 *   {position, questionVersionId, response, clientSentAt?}
 *   → {correct, correctness, correctAnswer, explanation, speedFactor,
 *      comboAfter, sessionFinished}
 *
 * The answer key is revealed here and only here — after grading.
 */
export const POST = route(
  { name: 'POST /api/sessions/:id/answer', schema: submitAnswerSchema, params: paramsSchema },
  async ({ request, requestId, params, body }) => {
    const { session, now } = await loadSessionContext(request, params.id);
    await rateLimit(session.ownerId, 'answer');
    // `now` was captured before any I/O, so the speed factor reflects when the
    // request arrived rather than how long grading took (§5.13, §17.3).
    if (await activityForSession(db(), session.id))
      return ok(
        await db().transaction((tx) =>
          resolveActivity(
            tx,
            session.id,
            session.ownerId,
            body.questionVersionId,
            body.response,
            now,
          ),
        ),
        requestId,
      );
    return ok(await submitAnswer(session, body, now), requestId);
  },
);
