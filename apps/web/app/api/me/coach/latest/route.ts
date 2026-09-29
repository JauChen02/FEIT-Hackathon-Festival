import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '@learnarena/core';
import { coachMessages } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const GET = route(
  { name: 'GET /api/me/coach/latest' },
  async ({ request, requestId, query }) => {
    const { user } = await requireOnboarded(request);
    const id = query.get('sessionId');
    if (id && !z.string().uuid().safeParse(id).success) throw new AppError('INVALID_INPUT');
    const [message] = await db()
      .select({
        message: coachMessages.message,
        source: coachMessages.source,
        kind: coachMessages.kind,
        createdAt: coachMessages.createdAt,
      })
      .from(coachMessages)
      .where(
        and(eq(coachMessages.userId, user.id), id ? eq(coachMessages.sessionId, id) : undefined),
      )
      .orderBy(desc(coachMessages.createdAt))
      .limit(1);
    return ok({ message: message ?? null }, requestId);
  },
);
