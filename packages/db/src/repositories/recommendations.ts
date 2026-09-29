/**
 * Recommendation repository (PLANNING.md §11.5, §15.5, §18.1).
 *
 * Every status change goes through a **guarded** UPDATE — `WHERE … AND status
 * IN (…)` — which is §18.1's prescribed mechanism for recommendation
 * completion. A guard that matches zero rows tells the caller it lost the
 * race, without needing to read first.
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { recommendationTransitions, uuidv7, type RecommendationStatus } from '@learnarena/core';
import type { Database } from '../client';
import { recommendations } from '../schema/index';

export interface RecommendationRecord {
  id: string;
  userId: string;
  localDate: string;
  categoryId: string;
  gameTypeId: string;
  targetRating: number;
  status: RecommendationStatus;
  reasonJson: unknown;
  completedSessionId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiredAt: Date | null;
}

function toRecord(row: typeof recommendations.$inferSelect): RecommendationRecord {
  return {
    id: row.id,
    userId: row.userId,
    localDate: row.localDate,
    categoryId: row.categoryId,
    gameTypeId: row.gameTypeId,
    targetRating: Number(row.targetRating),
    status: row.status,
    reasonJson: row.reasonJson,
    completedSessionId: row.completedSessionId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    expiredAt: row.expiredAt,
  };
}

export async function findRecommendationForDate(
  db: Database,
  userId: string,
  localDate: string,
): Promise<RecommendationRecord | undefined> {
  const rows = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.userId, userId), eq(recommendations.localDate, localDate)))
    .limit(1);
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function findRecommendationById(
  db: Database,
  id: string,
): Promise<RecommendationRecord | undefined> {
  const rows = await db.select().from(recommendations).where(eq(recommendations.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : undefined;
}

/**
 * Lock the recommendation row for the completion transaction (§18.2 step 6).
 *
 * Two sessions created from the same recommendation hold different session
 * rows, so nothing serialises them until here. Must be called inside a
 * transaction.
 */
export async function lockRecommendation(
  tx: Database,
  id: string,
): Promise<RecommendationRecord | undefined> {
  const rows = await tx
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .for('update')
    .limit(1);
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export interface InsertRecommendationInput {
  userId: string;
  localDate: string;
  categoryId: string;
  gameTypeId: string;
  targetRating: number;
  reason: unknown;
  now: Date;
}

/**
 * Create today's recommendation.
 *
 * `UNIQUE(user_id, local_date)` makes concurrent first-GETs safe: the loser
 * gets null back and re-reads the winner's row (§24 Phase 3 idempotency).
 */
export async function insertRecommendation(
  db: Database,
  input: InsertRecommendationInput,
): Promise<RecommendationRecord | null> {
  const inserted = await db
    .insert(recommendations)
    .values({
      id: uuidv7(),
      userId: input.userId,
      localDate: input.localDate,
      categoryId: input.categoryId,
      gameTypeId: input.gameTypeId,
      targetRating: input.targetRating.toFixed(2),
      status: 'AVAILABLE',
      reasonJson: input.reason,
      createdAt: input.now,
    })
    .onConflictDoNothing({
      target: [recommendations.userId, recommendations.localDate],
    })
    .returning();

  return inserted[0] ? toRecord(inserted[0]) : null;
}

/**
 * Guarded transition (§15.5). Returns false when the row was not in one of
 * `from`, which is how a caller learns it lost a race.
 */
async function transition(
  tx: Database,
  id: string,
  from: readonly RecommendationStatus[],
  to: RecommendationStatus,
  patch: Partial<{
    startedAt: Date | null;
    completedAt: Date | null;
    expiredAt: Date | null;
    completedSessionId: string | null;
  }> = {},
): Promise<boolean> {
  for (const source of from) {
    recommendationTransitions.assertTransition(source, to);
  }

  const updated = await tx
    .update(recommendations)
    .set({ status: to, ...patch })
    .where(and(eq(recommendations.id, id), inArray(recommendations.status, [...from])))
    .returning({ id: recommendations.id });

  return updated.length > 0;
}

/** §15.5: `AVAILABLE → IN_PROGRESS` when a session is started from it. */
export async function markInProgress(tx: Database, id: string, now: Date): Promise<boolean> {
  return transition(tx, id, ['AVAILABLE'], 'IN_PROGRESS', { startedAt: now });
}

/**
 * §15.5: `IN_PROGRESS → COMPLETED` on the first qualifying completion.
 *
 * This is the single place the ×1.5 bonus is granted.
 *
 * A recommendation can legitimately be `AVAILABLE` at completion time: if two
 * sessions were started from it and the first was abandoned, that abandon
 * released it back (§11.5, "abandoning does not consume it") while the second
 * is still running. §15.5 has no `AVAILABLE → COMPLETED` edge, so rather than
 * inventing one this walks the two legal transitions in order.
 */
export async function claimForCompletion(
  tx: Database,
  id: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  // No-op when the row is already IN_PROGRESS; claims it when it is not.
  await transition(tx, id, ['AVAILABLE'], 'IN_PROGRESS', { startedAt: now });

  return transition(tx, id, ['IN_PROGRESS'], 'COMPLETED', {
    completedAt: now,
    completedSessionId: sessionId,
  });
}

/**
 * §15.5: `IN_PROGRESS → AVAILABLE` when the session that claimed it was
 * abandoned, expired, cancelled, or completed without qualifying.
 *
 * §11.5: "Abandoning does not consume it."
 */
export async function releaseToAvailable(tx: Database, id: string): Promise<boolean> {
  // startedAt is cleared: the next session to claim it starts the clock afresh.
  return transition(tx, id, ['IN_PROGRESS'], 'AVAILABLE', { startedAt: null });
}

/**
 * §15.5: recommendations from past local dates expire lazily on the next read.
 *
 * Bulk, because a learner returning after a week has several to clear.
 */
export async function expirePastRecommendations(
  db: Database,
  userId: string,
  currentLocalDate: string,
  now: Date,
): Promise<number> {
  const updated = await db
    .update(recommendations)
    .set({ status: 'EXPIRED', expiredAt: now })
    .where(
      and(
        eq(recommendations.userId, userId),
        lt(recommendations.localDate, currentLocalDate),
        inArray(recommendations.status, ['AVAILABLE', 'IN_PROGRESS']),
      ),
    )
    .returning({ id: recommendations.id });

  return updated.length;
}

/** All of a learner's recommendations, newest first — used by tests and admin. */
export async function listRecommendations(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.userId, userId))
    .orderBy(sql`${recommendations.localDate} desc`);
  return rows.map(toRecord);
}
