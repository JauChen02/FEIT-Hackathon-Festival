/**
 * Answer + learning event repository (PLANNING.md §9, §14.2).
 *
 * §9: "Every game mode MUST write learning events through a single server
 * module … Quiz answers write the learning event **in the same transaction**
 * as the answer row."
 *
 * {@link recordResolvedQuestion} is that single path. Both the graded case and
 * the timeout case go through it, so Invariant 9 cannot be broken by adding a
 * new way to resolve a question.
 */

import { and, eq } from 'drizzle-orm';
import { uuidv7 } from '@learnarena/core';
import type { Database } from '../client';
import { answers, learningEvents } from '../schema/index';

export interface AnswerRecord {
  id: string;
  sessionId: string;
  userId: string;
  questionVersionId: string;
  position: number;
  outcome: 'ANSWERED' | 'TIMEOUT';
  responseJson: unknown;
  correctness: string;
  speedFactor: string;
  responseTimeMs: number | null;
  serverReceivedAt: Date;
}

export async function listAnswers(db: Database, sessionId: string): Promise<AnswerRecord[]> {
  return db
    .select()
    .from(answers)
    .where(eq(answers.sessionId, sessionId))
    .orderBy(answers.position);
}

export async function findAnswer(
  db: Database,
  sessionId: string,
  userId: string,
  questionVersionId: string,
): Promise<AnswerRecord | undefined> {
  const rows = await db
    .select()
    .from(answers)
    .where(
      and(
        eq(answers.sessionId, sessionId),
        eq(answers.userId, userId),
        eq(answers.questionVersionId, questionVersionId),
      ),
    )
    .limit(1);
  return rows[0];
}

export interface RecordResolvedQuestionInput {
  sessionId: string;
  userId: string;
  gameTypeId: string;
  questionVersionId: string;
  position: number;
  categoryId: string;
  subTopic: string | null;
  /** Canonical rating of the item at the time it was served (§9). */
  difficultyRating: string;
  outcome: 'ANSWERED' | 'TIMEOUT';
  /** 0..1. Timeouts are always 0 (§8.2). */
  correctness: number;
  /** Decimal string; see §10.1. */
  speedFactor: string;
  /** Null for a timeout — the learner never responded. */
  responseJson: unknown;
  responseTimeMs: number | null;
  serverReceivedAt: Date;
  /** Advisory diagnostic only (§14.1). */
  clientSentAt: Date | null;
}

/**
 * Write one resolved question: the answer row and its learning event, in one
 * transaction.
 *
 * The caller passes a transaction handle. The two `UNIQUE` constraints
 * (`answers_session_user_version_unique`,
 * `learning_events_session_user_source_unique`) are the real guard against a
 * duplicate; this function does not check first, so a race loses cleanly at
 * the database rather than racing a read.
 */
export async function recordResolvedQuestion(
  tx: Database,
  input: RecordResolvedQuestionInput,
): Promise<{ answerId: string; learningEventId: string }> {
  const answerId = uuidv7();
  const learningEventId = uuidv7();

  await tx.insert(answers).values({
    id: answerId,
    sessionId: input.sessionId,
    userId: input.userId,
    questionVersionId: input.questionVersionId,
    position: input.position,
    outcome: input.outcome,
    responseJson: input.responseJson,
    correctness: input.correctness.toFixed(3),
    speedFactor: Number(input.speedFactor).toFixed(4),
    responseTimeMs: input.responseTimeMs,
    serverReceivedAt: input.serverReceivedAt,
    clientSentAt: input.clientSentAt,
  });

  await tx.insert(learningEvents).values({
    id: learningEventId,
    userId: input.userId,
    sessionId: input.sessionId,
    gameTypeId: input.gameTypeId,
    // §9: unique within (session, user). The version id is the natural key for
    // a quiz; scenarios use a node id and mini-games an item index.
    sourceKey: input.questionVersionId,
    questionVersionId: input.questionVersionId,
    answerId,
    categoryId: input.categoryId,
    subTopic: input.subTopic,
    difficultyRating: input.difficultyRating,
    correctness: input.correctness.toFixed(3),
    timedOut: input.outcome === 'TIMEOUT',
    responseTimeMs: input.responseTimeMs,
    occurredAt: input.serverReceivedAt,
  });

  return { answerId, learningEventId };
}

export async function countLearningEvents(db: Database, sessionId: string): Promise<number> {
  const rows = await db
    .select({ id: learningEvents.id })
    .from(learningEvents)
    .where(eq(learningEvents.sessionId, sessionId));
  return rows.length;
}
