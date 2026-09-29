import 'server-only';
import {
  AppError,
  InsufficientQuestionsError,
  RECENT_ANSWER_EXCLUSION_DAYS,
  SOLO_QUESTION_COUNT,
  SOLO_TIME_LIMIT_MS,
  selectQuestions,
  uuidv7,
  type CreateSessionRequest,
} from '@learnarena/core';
import {
  findCategoryBySlug,
  findOpenSoloSession,
  findSessionByIdempotencyKey,
  insertSession,
  isUniqueViolation,
  listLiveCandidates,
  listRecentlyAnsweredVersionIds,
  type SessionRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { gameTypeIdForSlug } from './gameTypes';
import { userRatingFor } from './userRating';

/**
 * Session creation (PLANNING.md §16.2, §11.6, §18.1).
 *
 * The whole thing — question selection and the three inserts — happens in one
 * transaction, so a session can never exist without its ten questions.
 */

export interface CreateSessionResult {
  sessionId: string;
  status: 'CREATED';
  questionCount: number;
  timeLimitMs: number;
  /** True when an existing session was returned for a repeated idempotency key. */
  replayed: boolean;
}

function toResult(session: SessionRecord, replayed: boolean): CreateSessionResult {
  return {
    sessionId: session.id,
    status: 'CREATED',
    questionCount: session.questionCount ?? SOLO_QUESTION_COUNT,
    timeLimitMs: session.timeLimitMs ?? SOLO_TIME_LIMIT_MS,
    replayed,
  };
}

export async function createSoloSession(input: {
  userId: string;
  request: CreateSessionRequest;
  idempotencyKey: string;
  now: Date;
}): Promise<CreateSessionResult> {
  const { userId, request, idempotencyKey, now } = input;

  // §18.1: a repeated Idempotency-Key returns the existing session rather than
  // creating a second one.
  const existing = await findSessionByIdempotencyKey(db(), userId, idempotencyKey);
  if (existing) return toResult(existing, true);

  const category = await findCategoryBySlug(db(), request.categorySlug);
  if (!category || category.status !== 'LAUNCH') {
    // ADR-036: non-launch categories exist as rows but are not playable.
    throw new AppError('NOT_FOUND', { message: 'That category is not available to play.' });
  }

  // §8.1 / ADR-012: at most one open solo session per user. The partial unique
  // index is the real guard; this check exists to return the friendlier error
  // with the open session's id, as §8.1 requires.
  const open = await findOpenSoloSession(db(), userId);
  if (open) {
    throw new AppError('ACTIVE_SESSION_EXISTS', {
      details: { sessionId: open.id, status: open.status },
    });
  }

  const gameTypeId = await gameTypeIdForSlug(request.gameType);

  // §11.6. The session id seeds the tie-break, so it must exist before the
  // questions are chosen.
  const sessionId = uuidv7();

  const candidates = await listLiveCandidates(db(), category.id);
  const exclusionSince = new Date(now.getTime() - RECENT_ANSWER_EXCLUSION_DAYS * 86_400_000);
  const recentlyAnswered = await listRecentlyAnsweredVersionIds(
    db(),
    userId,
    category.id,
    exclusionSince,
  );

  let selection;
  try {
    selection = selectQuestions({
      candidates,
      userRating: await userRatingFor(userId, category.id),
      recentlyAnsweredVersionIds: recentlyAnswered,
      sessionId,
    });
  } catch (error) {
    if (error instanceof InsufficientQuestionsError) {
      // An operational content problem, not something the learner did. Loud in
      // the logs, clean to the client.
      logger.error(
        { category: request.categorySlug, available: error.available, required: error.required },
        'session.insufficient_questions',
      );
      throw new AppError('NOT_FOUND', {
        message: 'That category does not have enough questions to play yet.',
        details: { reason: 'INSUFFICIENT_QUESTIONS', available: error.available },
      });
    }
    throw error;
  }

  try {
    await db().transaction(async (tx) => {
      await insertSession(tx, {
        id: sessionId,
        ownerId: userId,
        gameTypeId,
        categoryId: category.id,
        questionCount: SOLO_QUESTION_COUNT,
        timeLimitMs: SOLO_TIME_LIMIT_MS,
        creationIdempotencyKey: idempotencyKey,
        // §11.8: the tier is snapshotted at creation. Phase 1 has no Coach, so
        // it is always NONE; Phase 3 computes WEAK / RECOMMENDED here.
        weaknessTier: 'NONE',
        weaknessSnapshot: {
          phase: 1,
          reason: 'No Coach before Phase 3; weakness tier is NONE.',
          targetRating: selection.targetRating,
          exclusionRelaxed: selection.exclusionRelaxed,
        },
        questionVersionIds: selection.selected.map((item) => item.questionVersionId),
        now,
      });
    });
  } catch (error) {
    // Two requests raced past the pre-check above; the partial unique index
    // caught the loser (§18.1).
    if (isUniqueViolation(error, 'one_open_solo_session')) {
      const winner = await findOpenSoloSession(db(), userId);
      throw new AppError('ACTIVE_SESSION_EXISTS', {
        details: { sessionId: winner?.id, status: winner?.status },
      });
    }
    // Same key submitted twice concurrently: return whichever row landed.
    if (isUniqueViolation(error, 'game_sessions_owner_idempotency_unique')) {
      const winner = await findSessionByIdempotencyKey(db(), userId, idempotencyKey);
      if (winner) return toResult(winner, true);
    }
    throw error;
  }

  logger.info(
    { session_id: sessionId, user_id: userId, category: request.categorySlug },
    'session.created',
  );

  return {
    sessionId,
    status: 'CREATED',
    questionCount: SOLO_QUESTION_COUNT,
    timeLimitMs: SOLO_TIME_LIMIT_MS,
    replayed: false,
  };
}
