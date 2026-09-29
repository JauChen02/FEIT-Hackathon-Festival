import {
  AppError,
  SOLO_QUESTION_COUNT,
  historyQuerySchema,
  type HistoryItem,
  type HistoryResponse,
  type SessionResult,
} from '@learnarena/core';
import { listCompletedSessions } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { categorySlugForId } from '@/lib/sessions/categories';

export const dynamic = 'force-dynamic';

/** One screen's worth; §20 screen 8 is a simple list. */
const PAGE_SIZE = 20;

/**
 * GET /api/me/history?cursor= (PLANNING.md §16.2, §20 screen 8).
 *
 * "completed sessions with points."
 *
 * Keyset pagination on the session id: ids are UUID v7, so ordering by id
 * descending is ordering by creation time descending, and no extra column or
 * index is needed (the Phase 0 `game_sessions_owner_history_idx` covers the
 * owner filter).
 */
export const GET = route({ name: 'GET /api/me/history' }, async ({ request, requestId, query }) => {
  const { user } = await requireOnboarded(request);

  const parsed = historyQuerySchema.safeParse({
    cursor: query.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', { message: 'That cursor is not valid.' });
  }

  // One extra row tells us whether another page exists without a count query.
  const rows = await listCompletedSessions(db(), user.id, {
    cursor: parsed.data.cursor,
    limit: PAGE_SIZE + 1,
  });

  const page = rows.slice(0, PAGE_SIZE);
  const sessions: HistoryItem[] = await Promise.all(
    page.map(async (row) => {
      const result = row.resultJson as SessionResult | null;
      return {
        sessionId: row.sessionId,
        categorySlug: result?.categorySlug ?? (await categorySlugForId(db(), row.categoryId)),
        finalPoints: result?.finalPoints ?? 0,
        accuracy: result?.accuracy ?? 0,
        correctCount: result?.correctCount ?? 0,
        questionCount: result?.questionCount ?? SOLO_QUESTION_COUNT,
        endedAt: row.endedAt?.toISOString() ?? null,
      };
    }),
  );

  const response: HistoryResponse = {
    sessions,
    nextCursor: rows.length > PAGE_SIZE ? (page.at(-1)?.sessionId ?? null) : null,
  };

  return ok(response, requestId);
});
