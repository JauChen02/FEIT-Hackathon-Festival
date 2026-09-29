import 'server-only';
import {
  chooseRecommendation,
  localDateFor,
  tierMultiplier,
  type RecommendationResponse,
} from '@learnarena/core';
import {
  expirePastRecommendations,
  findRecommendationForDate,
  insertRecommendation,
  type RecommendationRecord,
  type UserRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { gameTypeIdForSlug } from '../sessions/gameTypes';
import { loadCoachSignals, type CoachSignals } from './signals';

/**
 * The daily recommendation (PLANNING.md §11.5, §15.5).
 *
 * "One recommendation per user per local date, generated **lazily** on the
 *  first `GET /api/me/recommendation` of that local date (no cron)."
 *
 * Lazy generation means a learner who never opens the app never has a row
 * written for them, and the date is theirs — §12.1's local date, not UTC.
 */

export interface RecommendationWithContext {
  record: RecommendationRecord;
  signals: CoachSignals;
  /** True when this call created the row rather than reading it. */
  created: boolean;
}

/**
 * Fetch today's recommendation, generating it if this is the first read.
 *
 * Concurrent first-reads are safe: `UNIQUE(user_id, local_date)` lets exactly
 * one insert win and the losers re-read the winner's row (§18.1).
 */
export async function getOrCreateRecommendation(
  user: UserRecord,
  now: Date,
): Promise<RecommendationWithContext> {
  const localDate = localDateFor(user.timezone, now);

  // §15.5: yesterday's recommendation expires lazily on the next read, rather
  // than needing a midnight cron (the same reasoning as ADR-013 for streaks).
  const expired = await expirePastRecommendations(db(), user.id, localDate, now);
  if (expired > 0) {
    logger.info({ user_id: user.id, expired }, 'coach.recommendations_expired');
  }

  const signals = await loadCoachSignals(db(), user.id, now);

  const existing = await findRecommendationForDate(db(), user.id, localDate);
  if (existing) return { record: existing, signals, created: false };

  const choice = chooseRecommendation({
    signals: signals.derived,
    userId: user.id,
    localDate,
    // §11.5 step 3: "among live game types linked to the category … MVP:
    // always quiz_solo".
    gameTypeSlug: 'quiz_solo',
  });

  const category = signals.categoryBySlug.get(choice.categorySlug);
  if (!category) {
    throw new Error(`chooseRecommendation returned unknown category ${choice.categorySlug}`);
  }

  const inserted = await insertRecommendation(db(), {
    userId: user.id,
    localDate,
    categoryId: category.id,
    gameTypeId: await gameTypeIdForSlug('quiz_solo'),
    targetRating: choice.targetRating,
    reason: choice.reason,
    now,
  });

  if (!inserted) {
    // A concurrent first-read won. Its row is the one that counts.
    const winner = await findRecommendationForDate(db(), user.id, localDate);
    if (!winner) throw new Error('recommendation insert conflicted but no row was found');
    return { record: winner, signals, created: false };
  }

  logger.info(
    { user_id: user.id, local_date: localDate, category: choice.categorySlug },
    'coach.recommendation_generated',
  );

  return { record: inserted, signals, created: true };
}

/** Shape the stored row for the API (§16.2). */
export function toRecommendationResponse(
  context: RecommendationWithContext,
): RecommendationResponse {
  const { record, signals } = context;
  const category = signals.categoryById.get(record.categoryId);
  const derived = category ? signals.bySlug.get(category.slug) : undefined;

  // §11.5: "After completion it stays visible (marked done) but can never
  // grant the bonus again."
  const claimable = record.status === 'AVAILABLE' || record.status === 'IN_PROGRESS';

  return {
    recommendationId: record.id,
    categorySlug: category?.slug ?? '',
    categoryName: category?.name ?? '',
    gameTypeSlug: 'quiz_solo',
    status: record.status,
    localDate: record.localDate,
    targetRating: record.targetRating,
    bonusMultiplier: claimable ? tierMultiplier('RECOMMENDED') : tierMultiplier('NONE'),
    claimable,
    weaknessScore: derived?.weaknessScore ?? 0,
    proficiency: derived?.proficiency ?? 0,
    neverPlayed: derived?.neverPlayed ?? false,
  };
}
