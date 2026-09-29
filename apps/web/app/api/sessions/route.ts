import { rateLimit } from '@/lib/security/rateLimit';
import { createActivitySession } from '@/lib/games/create';
import { AppError, createSessionSchema, idempotencyKeySchema } from '@learnarena/core';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { createSoloSession } from '@/lib/sessions/createSession';
import { now } from '@/lib/sessions/context';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sessions (PLANNING.md §16.2).
 *
 *   Header Idempotency-Key: <uuid>
 *   {gameType:"quiz_solo", categorySlug}
 *   → {sessionId, status:"CREATED", questionCount, timeLimitMs}
 *
 * §16.2 does not list `recommendationId` as optional, but Phase 1 has no
 * recommendations to link (Phase 3 adds them with the §11.8 tier snapshot), so
 * the field is not accepted yet.
 */
export const POST = route(
  { name: 'POST /api/sessions', schema: createSessionSchema },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);

    await rateLimit(user.id, 'session');
    // §18.1: session creation is keyed by this header.
    const rawKey = request.headers.get('idempotency-key');
    const parsedKey = idempotencyKeySchema.safeParse(rawKey ?? '');
    if (!parsedKey.success) {
      throw new AppError('INVALID_INPUT', {
        message: 'An Idempotency-Key header containing a UUID is required.',
        details: { header: 'Idempotency-Key' },
      });
    }

    if (body.gameType !== 'quiz_solo')
      return ok(await createActivitySession(user, body, parsedKey.data, now(request)), requestId);

    const result = await createSoloSession({
      userId: user.id,
      timezone: user.timezone,
      request: body,
      idempotencyKey: parsedKey.data,
      now: now(request),
    });

    return ok(
      {
        sessionId: result.sessionId,
        status: result.status,
        questionCount: result.questionCount,
        timeLimitMs: result.timeLimitMs,
      },
      requestId,
    );
  },
);
