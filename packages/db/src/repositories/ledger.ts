/**
 * Point ledger repository (PLANNING.md §14.2, ADR-006).
 *
 * Invariant 3: "Every point change has a canonical `point_ledger` record. The
 * ledger is append-only." There is no update path here, by design — the Phase 0
 * triggers would reject one anyway.
 */

import { eq, sql } from 'drizzle-orm';
import { uuidv7, weekKeyUtc, type PointsBreakdown } from '@learnarena/core';
import type { Database } from '../client';
import { pointLedger, users } from '../schema/index';

export type LedgerReason =
  'SESSION_COMPLETION' | 'DAILY_CHALLENGE_BONUS' | 'ACHIEVEMENT' | 'ADJUSTMENT';

/**
 * The deterministic key that makes an award happen at most once (§18.1).
 *
 * Deriving it from the session, the user and the reason means a retry — even a
 * concurrent one — collides on `point_ledger.idempotency_key` instead of
 * writing a second row.
 */
export function sessionCompletionKey(sessionId: string, userId: string): string {
  return `session:${sessionId}:user:${userId}:SESSION_COMPLETION`;
}

export interface InsertLedgerRowInput {
  userId: string;
  sessionId: string | null;
  reason: LedgerReason;
  breakdown: PointsBreakdown;
  idempotencyKey: string;
  now: Date;
}

/**
 * Append one award. Returns null when the key already exists, which is how a
 * concurrent completion discovers it lost the race.
 */
export async function insertLedgerRow(
  tx: Database,
  input: InsertLedgerRowInput,
): Promise<{ id: string } | null> {
  const inserted = await tx
    .insert(pointLedger)
    .values({
      id: uuidv7(),
      userId: input.userId,
      sessionId: input.sessionId,
      reason: input.reason,
      rawBasePoints: input.breakdown.rawBasePoints,
      comboAdjustedPoints: input.breakdown.comboAdjustedPoints,
      // §10.4: the full breakdown, so any award can be reproduced.
      multipliersJson: input.breakdown,
      uncappedPoints: input.breakdown.uncappedPoints,
      capApplied: input.breakdown.capApplied,
      finalPoints: input.breakdown.finalPoints,
      weekKey: weekKeyUtc(input.now),
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: pointLedger.idempotencyKey })
    .returning({ id: pointLedger.id });

  return inserted[0] ?? null;
}

export async function findLedgerRowByKey(db: Database, idempotencyKey: string) {
  const rows = await db
    .select()
    .from(pointLedger)
    .where(eq(pointLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  return rows[0];
}

/**
 * Advance the cached total (§18.2 step 9).
 *
 * A relative `+=` rather than a recomputed sum: it runs inside the same
 * transaction as the insert, so the two cannot drift, and it does not need to
 * scan the ledger. `users.total_points_cached` remains rebuildable from the
 * ledger (§14.3, Invariant 4).
 */
export async function addToCachedTotal(
  tx: Database,
  userId: string,
  points: number,
  now: Date,
): Promise<void> {
  await tx
    .update(users)
    .set({
      totalPointsCached: sql`${users.totalPointsCached} + ${points}`,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}

/** Canonical sum for a user — the value the cache must equal (Invariant 4). */
export async function sumLedgerPoints(db: Database, userId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${pointLedger.finalPoints}), 0)::int` })
    .from(pointLedger)
    .where(eq(pointLedger.userId, userId));
  return rows[0]?.total ?? 0;
}

export async function rebuildPointsTotal(db: Database, userId: string, now: Date): Promise<number> {
  const total = await sumLedgerPoints(db, userId);
  await db
    .update(users)
    .set({ totalPointsCached: total, updatedAt: now })
    .where(eq(users.id, userId));
  return total;
}
