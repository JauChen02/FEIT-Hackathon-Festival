/**
 * Session repository (PLANNING.md §14.2, §15.1, §18).
 *
 * All session I/O lives here. Every status change goes through
 * {@link transitionSession}, which checks legality against the §15.1 table
 * *and* uses a guarded `UPDATE … WHERE status = :from`, so a concurrent writer
 * cannot produce an illegal transition even if both pass the in-process check.
 */

import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  InvalidStateTransitionError,
  OPEN_SESSION_STATUSES,
  sessionTransitions,
  type SessionStatus,
} from '@learnarena/core';
import type { Database } from '../client';
import { gameSessions, sessionPlayers, sessionQuestions } from '../schema/index';

export interface SessionRecord {
  id: string;
  ownerId: string;
  gameTypeId: string;
  categoryId: string | null;
  mode: 'SOLO' | 'COOP' | 'VERSUS';
  status: SessionStatus;
  weaknessTier: 'NONE' | 'WEAK' | 'RECOMMENDED';
  weaknessSnapshotJson: unknown;
  recommendationId: string | null;
  dailyChallengeId: string | null;
  questionCount: number | null;
  timeLimitMs: number | null;
  localDate: string | null;
  isQualifying: boolean | null;
  resultJson: unknown;
  createdAt: Date;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  endedAt: Date | null;
  postProcessedAt: Date | null;
}

const SESSION_COLUMNS = {
  id: gameSessions.id,
  ownerId: gameSessions.ownerId,
  gameTypeId: gameSessions.gameTypeId,
  categoryId: gameSessions.categoryId,
  mode: gameSessions.mode,
  status: gameSessions.status,
  weaknessTier: gameSessions.weaknessTier,
  weaknessSnapshotJson: gameSessions.weaknessSnapshotJson,
  recommendationId: gameSessions.recommendationId,
  dailyChallengeId: gameSessions.dailyChallengeId,
  questionCount: gameSessions.questionCount,
  timeLimitMs: gameSessions.timeLimitMs,
  localDate: gameSessions.localDate,
  isQualifying: gameSessions.isQualifying,
  resultJson: gameSessions.resultJson,
  createdAt: gameSessions.createdAt,
  startedAt: gameSessions.startedAt,
  lastActivityAt: gameSessions.lastActivityAt,
  endedAt: gameSessions.endedAt,
  postProcessedAt: gameSessions.postProcessedAt,
} as const;

export async function findSessionById(
  db: Database,
  sessionId: string,
): Promise<SessionRecord | undefined> {
  const rows = await db
    .select(SESSION_COLUMNS)
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .limit(1);
  return rows[0];
}

/**
 * Load a session for update (§18.2 step 1).
 *
 * `SELECT … FOR UPDATE` serialises concurrent `/complete` calls: the first
 * holds the row, the rest block until it commits and then observe `COMPLETED`.
 * Must be called inside a transaction.
 */
export async function lockSession(
  tx: Database,
  sessionId: string,
): Promise<SessionRecord | undefined> {
  const rows = await tx
    .select(SESSION_COLUMNS)
    .from(gameSessions)
    .where(eq(gameSessions.id, sessionId))
    .for('update')
    .limit(1);
  return rows[0];
}

/** The user's open solo session, if any (§8.1, ADR-012). */
export async function findOpenSoloSession(
  db: Database,
  ownerId: string,
): Promise<SessionRecord | undefined> {
  const rows = await db
    .select(SESSION_COLUMNS)
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.ownerId, ownerId),
        eq(gameSessions.mode, 'SOLO'),
        inArray(gameSessions.status, [...OPEN_SESSION_STATUSES]),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function findSessionByIdempotencyKey(
  db: Database,
  ownerId: string,
  key: string,
): Promise<SessionRecord | undefined> {
  const rows = await db
    .select(SESSION_COLUMNS)
    .from(gameSessions)
    .where(and(eq(gameSessions.ownerId, ownerId), eq(gameSessions.creationIdempotencyKey, key)))
    .limit(1);
  return rows[0];
}

export interface CreateSessionInput {
  id: string;
  ownerId: string;
  gameTypeId: string;
  categoryId: string | null;
  questionCount: number;
  timeLimitMs: number;
  creationIdempotencyKey: string;
  weaknessTier: 'NONE' | 'WEAK' | 'RECOMMENDED';
  weaknessSnapshot: unknown;
  /** Set when the session was started from today's recommendation (§11.8). */
  recommendationId?: string | null;
  dailyChallengeId?: string | null;
  questionVersionIds: readonly string[];
  now: Date;
}

/**
 * Create a `CREATED` session with its players and its ten questions, in one
 * transaction (§11.6 step 6).
 */
export async function insertSession(tx: Database, input: CreateSessionInput): Promise<void> {
  await tx.insert(gameSessions).values({
    id: input.id,
    gameTypeId: input.gameTypeId,
    mode: 'SOLO',
    categoryId: input.categoryId,
    ownerId: input.ownerId,
    status: 'CREATED',
    weaknessTier: input.weaknessTier,
    weaknessSnapshotJson: input.weaknessSnapshot,
    recommendationId: input.recommendationId ?? null,
    dailyChallengeId: input.dailyChallengeId ?? null,
    questionCount: input.questionCount,
    timeLimitMs: input.timeLimitMs,
    creationIdempotencyKey: input.creationIdempotencyKey,
    createdAt: input.now,
    lastActivityAt: input.now,
  });

  // Solo sessions have exactly one player row (§14.2).
  await tx.insert(sessionPlayers).values({ sessionId: input.id, userId: input.ownerId });

  if (input.questionVersionIds.length)
    await tx.insert(sessionQuestions).values(
      input.questionVersionIds.map((questionVersionId, position) => ({
        sessionId: input.id,
        position,
        questionVersionId,
      })),
    );
}

/**
 * Move a session to a new status.
 *
 * Returns false when the guarded update matched nothing, which means another
 * request changed the status first. Throws for a transition the §15.1 table
 * forbids outright.
 */
export async function transitionSession(
  tx: Database,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
  patch: Partial<{
    startedAt: Date;
    lastActivityAt: Date;
    endedAt: Date;
    localDate: string;
    isQualifying: boolean;
    resultJson: unknown;
  }> = {},
): Promise<boolean> {
  sessionTransitions.assertTransition(from, to);

  const updated = await tx
    .update(gameSessions)
    .set({ status: to, ...patch })
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.status, from)))
    .returning({ id: gameSessions.id });

  return updated.length > 0;
}

/** Throwing variant, for callers that have already established the state. */
export async function requireTransition(
  tx: Database,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
  patch?: Parameters<typeof transitionSession>[4],
): Promise<void> {
  const moved = await transitionSession(tx, sessionId, from, to, patch);
  if (!moved) {
    throw new InvalidStateTransitionError('game_session', from, to);
  }
}

export async function touchSession(db: Database, sessionId: string, now: Date): Promise<void> {
  await db.update(gameSessions).set({ lastActivityAt: now }).where(eq(gameSessions.id, sessionId));
}

export async function markPostProcessed(db: Database, sessionId: string, now: Date): Promise<void> {
  await db
    .update(gameSessions)
    .set({ postProcessedAt: now })
    .where(and(eq(gameSessions.id, sessionId), isNull(gameSessions.postProcessedAt)));
}

// ---------------------------------------------------------------------------
// session_questions
// ---------------------------------------------------------------------------

export interface SessionQuestionRecord {
  sessionId: string;
  position: number;
  questionVersionId: string;
  servedAt: Date | null;
  deadlineAt: Date | null;
}

export async function listSessionQuestions(
  db: Database,
  sessionId: string,
): Promise<SessionQuestionRecord[]> {
  return db
    .select()
    .from(sessionQuestions)
    .where(eq(sessionQuestions.sessionId, sessionId))
    .orderBy(sessionQuestions.position);
}

/**
 * Record that a question was served (§8.1, ADR-011).
 *
 * The guard on `served_at IS NULL` is what makes `/next` idempotent: a retry
 * matches nothing and the caller returns the already-served question with its
 * original deadline, rather than silently extending it.
 */
export async function markQuestionServed(
  db: Database,
  sessionId: string,
  position: number,
  servedAt: Date,
  deadlineAt: Date,
): Promise<boolean> {
  const updated = await db
    .update(sessionQuestions)
    .set({ servedAt, deadlineAt })
    .where(
      and(
        eq(sessionQuestions.sessionId, sessionId),
        eq(sessionQuestions.position, position),
        isNull(sessionQuestions.servedAt),
      ),
    )
    .returning({ position: sessionQuestions.position });

  return updated.length > 0;
}

// ---------------------------------------------------------------------------
// Sweeps and history
// ---------------------------------------------------------------------------

/** Open sessions idle since before `cutoff` — the `sessions/expire-stale` input. */
export async function listStaleOpenSessions(
  db: Database,
  cutoff: Date,
  limit = 500,
): Promise<SessionRecord[]> {
  return db
    .select(SESSION_COLUMNS)
    .from(gameSessions)
    .where(
      and(
        inArray(gameSessions.status, [...OPEN_SESSION_STATUSES]),
        lt(gameSessions.lastActivityAt, cutoff),
      ),
    )
    .limit(limit);
}

/** Terminal sessions still unprocessed — the `sessions/reconcile` input (§18.3). */
export async function listUnprocessedTerminalSessions(
  db: Database,
  cutoff: Date,
  limit = 500,
): Promise<{ id: string; ownerId: string }[]> {
  return db
    .select({ id: gameSessions.id, ownerId: gameSessions.ownerId })
    .from(gameSessions)
    .where(
      and(
        isNull(gameSessions.postProcessedAt),
        sql`${gameSessions.status} in ('COMPLETED','ABANDONED','EXPIRED','CANCELLED')`,
        lt(gameSessions.endedAt, cutoff),
      ),
    )
    .limit(limit);
}

/**
 * Accuracies of the learner's prior qualifying sessions in a category, most
 * recent first (§11.7).
 *
 * "Abandoned/expired sessions are never part of the baseline", so the filter
 * is `COMPLETED AND is_qualifying`. `ended_at < before` excludes the session
 * being scored, which is still ACTIVE at the point this runs but would
 * otherwise be picked up by a retry.
 */
export async function listPriorQualifyingAccuracies(
  db: Database,
  ownerId: string,
  categoryId: string,
  before: Date,
  limit: number,
): Promise<number[]> {
  const rows = await db
    .select({ resultJson: gameSessions.resultJson })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.ownerId, ownerId),
        eq(gameSessions.categoryId, categoryId),
        eq(gameSessions.status, 'COMPLETED'),
        eq(gameSessions.isQualifying, true),
        lt(gameSessions.endedAt, before),
      ),
    )
    .orderBy(desc(gameSessions.endedAt))
    .limit(limit);

  return rows
    .map((row) => (row.resultJson as { accuracy?: number } | null)?.accuracy)
    .filter((accuracy): accuracy is number => typeof accuracy === 'number');
}

export interface HistoryEntry {
  sessionId: string;
  categoryId: string | null;
  endedAt: Date | null;
  resultJson: unknown;
}

/**
 * Completed sessions, newest first (§16.2 `GET /api/me/history`).
 *
 * Keyset pagination on the id: ids are UUID v7, so they sort by creation time
 * and no extra ordering column is needed.
 */
export async function listCompletedSessions(
  db: Database,
  ownerId: string,
  options: { cursor?: string | undefined; limit: number },
): Promise<HistoryEntry[]> {
  return db
    .select({
      sessionId: gameSessions.id,
      categoryId: gameSessions.categoryId,
      endedAt: gameSessions.endedAt,
      resultJson: gameSessions.resultJson,
    })
    .from(gameSessions)
    .innerJoin(
      sessionPlayers,
      and(eq(sessionPlayers.sessionId, gameSessions.id), eq(sessionPlayers.userId, ownerId)),
    )
    .where(
      and(
        eq(gameSessions.status, 'COMPLETED'),
        options.cursor ? lt(gameSessions.id, options.cursor) : undefined,
      ),
    )
    .orderBy(desc(gameSessions.id))
    .limit(options.limit);
}
