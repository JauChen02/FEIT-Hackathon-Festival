import 'server-only';
import {
  AppError,
  InsufficientQuestionsError,
  isWeakCategory,
  localDateFor,
  RECENT_ANSWER_EXCLUSION_DAYS,
  SOLO_QUESTION_COUNT,
  SOLO_TIME_LIMIT_MS,
  selectQuestions,
  uuidv7,
  type CreateSessionRequest,
} from '@learnarena/core';
import {
  findCategoryBySlug,
  findDailyChallenge,
  findOpenSoloSession,
  findRecommendationById,
  findSessionByIdempotencyKey,
  insertSession,
  isUniqueViolation,
  listLiveCandidates,
  listRecentlyAnsweredVersionIds,
  markInProgress,
  type SessionRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { loadCoachSignals } from '../coach/signals';
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
  timezone: string;
  request: CreateSessionRequest;
  idempotencyKey: string;
  now: Date;
}): Promise<CreateSessionResult> {
  const { userId, timezone, request, idempotencyKey, now } = input;

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

  const challenge = request.dailyChallengeId
    ? await findDailyChallenge(db(), localDateFor(timezone, now))
    : null;
  if (
    request.dailyChallengeId &&
    (!challenge ||
      challenge.id !== request.dailyChallengeId ||
      challenge.questions.length !== 10 ||
      challenge.questions.some((q) => q.categoryId !== category.id))
  )
    throw new AppError('INVALID_INPUT', {
      message: 'That daily challenge is not available for this category and date.',
    });

  const candidates = await listLiveCandidates(db(), category.id);
  const exclusionSince = new Date(now.getTime() - RECENT_ANSWER_EXCLUSION_DAYS * 86_400_000);
  const recentlyAnswered = await listRecentlyAnsweredVersionIds(
    db(),
    userId,
    category.id,
    exclusionSince,
  );

  // §11.8: the tier is decided **now** and frozen onto the session, so later
  // skill changes cannot retroactively re-price a session already played.
  const signals = await loadCoachSignals(db(), userId, now);
  const wasWeak = isWeakCategory(signals.derived, category.slug);

  let weaknessTier: 'NONE' | 'WEAK' | 'RECOMMENDED' = wasWeak ? 'WEAK' : 'NONE';
  let linkedRecommendationId: string | null = null;

  if (request.recommendationId) {
    const recommendation = await findRecommendationById(db(), request.recommendationId);
    const localDate = localDateFor(timezone, now);

    // RECOMMENDED only when it is *today's* recommendation, belongs to this
    // learner, still claimable, and actually points at this category.
    const usable =
      recommendation !== undefined &&
      recommendation.userId === userId &&
      recommendation.localDate === localDate &&
      recommendation.categoryId === category.id &&
      (recommendation.status === 'AVAILABLE' || recommendation.status === 'IN_PROGRESS');

    if (usable) {
      weaknessTier = 'RECOMMENDED';
      linkedRecommendationId = recommendation.id;
    } else {
      logger.info(
        { user_id: userId, recommendation_id: request.recommendationId },
        'coach.recommendation_not_usable',
      );
    }
  }

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
        weaknessTier,
        // The snapshot is what the completion transaction falls back to when
        // the recommendation turns out to be spent (§11.8).
        weaknessSnapshot: {
          wasWeak,
          tier: weaknessTier,
          targetRating: selection.targetRating,
          exclusionRelaxed: selection.exclusionRelaxed,
          categories: signals.derived.map((signal) => ({
            categorySlug: signal.categorySlug,
            rating: signal.rating,
            weaknessScore: signal.weaknessScore,
            proficiency: signal.proficiency,
            confidence: signal.confidence,
          })),
        },
        recommendationId: linkedRecommendationId,
        dailyChallengeId: challenge?.id ?? null,
        questionVersionIds: challenge
          ? challenge.questions.map((q) => q.id)
          : selection.selected.map((item) => item.questionVersionId),
        now,
      });

      // §15.5: AVAILABLE → IN_PROGRESS. Inside the same transaction as the
      // session insert, so a session can never exist claiming a recommendation
      // that was never moved.
      if (linkedRecommendationId) {
        await markInProgress(tx, linkedRecommendationId, now);
      }
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
