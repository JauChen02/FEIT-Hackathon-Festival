import { z } from 'zod';
import {
  SOLO_QUESTION_COUNT,
  SOLO_TIME_LIMIT_MS,
  type SessionResult,
  type SessionStateResponse,
} from '@learnarena/core';
import { listAnswers } from '@learnarena/db';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { loadSessionContext } from '@/lib/sessions/context';
import { categorySlugForId } from '@/lib/sessions/categories';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * GET /api/sessions/:id (PLANNING.md §16.2).
 *
 * "session state; results payload if COMPLETED; skill deltas when
 *  post-processed."
 *
 * Skill deltas stay null until Phase 3 runs `coach/process-session` (§18.3).
 */
export const GET = route(
  { name: 'GET /api/sessions/:id', params: paramsSchema },
  async ({ request, requestId, params }) => {
    const { session } = await loadSessionContext(request, params.id);
    const answers = await listAnswers(db(), session.id);

    const response: SessionStateResponse = {
      session: {
        id: session.id,
        status: session.status,
        categorySlug: await categorySlugForId(db(), session.categoryId),
        questionCount: session.questionCount ?? SOLO_QUESTION_COUNT,
        timeLimitMs: session.timeLimitMs ?? SOLO_TIME_LIMIT_MS,
        resolvedCount: answers.length,
        createdAt: session.createdAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
      },
      result: (session.resultJson as SessionResult | null) ?? null,
      skillDeltas: null,
    };

    return ok(response, requestId);
  },
);
