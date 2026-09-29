import 'server-only';
import { releaseToAvailable, type SessionRecord } from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';

/**
 * Give a recommendation back when the session that claimed it ends without a
 * qualifying completion (PLANNING.md §11.5, §15.5).
 *
 * "Abandoning does not consume it." The same applies to a cancelled session
 * and to one that expired — in every case the learner should still be able to
 * earn today's ×1.5 on a fresh attempt.
 *
 * Guarded by `IN_PROGRESS → AVAILABLE`, so a recommendation that has already
 * been completed by a *different* session is left alone.
 */
export async function releaseRecommendation(session: SessionRecord): Promise<void> {
  if (!session.recommendationId) return;

  const released = await releaseToAvailable(db(), session.recommendationId);
  if (released) {
    logger.info(
      { session_id: session.id, recommendation_id: session.recommendationId },
      'coach.recommendation_released',
    );
  }
}
