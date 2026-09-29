import 'server-only';
import { ANSWER_GRACE_MS } from '@learnarena/core';
import {
  isUniqueViolation,
  loadQuestionVersions,
  recordResolvedQuestion,
  type SessionQuestionRecord,
  type SessionRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';

/**
 * Resolving a question the learner never answered (PLANNING.md §8.2).
 *
 * "Question served but never answered, deadline passed → resolved as `TIMEOUT`
 *  lazily (on next request for that session, or on `/complete`)."
 *
 * A timeout is a real assessed item: correctness 0, an `answers` row and a
 * learning event, so the Coach sees it (Invariant 9). §10.1 notes the speed
 * factor is irrelevant when correctness is 0; it is stored at the 0.5 floor
 * for consistency rather than left null.
 */

export function isPastGrace(question: SessionQuestionRecord, at: Date): boolean {
  if (!question.deadlineAt) return false;
  return at.getTime() > question.deadlineAt.getTime() + ANSWER_GRACE_MS;
}

/** A served, unanswered question whose grace window has closed. */
export function findExpiredServed(
  questions: readonly SessionQuestionRecord[],
  answeredVersionIds: ReadonlySet<string>,
  at: Date,
): SessionQuestionRecord[] {
  return questions.filter(
    (question) =>
      question.servedAt !== null &&
      !answeredVersionIds.has(question.questionVersionId) &&
      isPastGrace(question, at),
  );
}

/**
 * Write TIMEOUT rows for the given questions.
 *
 * Each is its own transaction so one failure cannot roll back the others, and
 * a duplicate (two requests resolving the same question at once) is absorbed:
 * the unique constraint means the loser simply has nothing to do.
 */
export async function resolveTimeouts(
  session: SessionRecord,
  questions: readonly SessionQuestionRecord[],
  at: Date,
): Promise<number> {
  if (questions.length === 0) return 0;

  const versions = await loadQuestionVersions(
    db(),
    questions.map((question) => question.questionVersionId),
  );

  let resolved = 0;
  for (const question of questions) {
    const version = versions.get(question.questionVersionId);
    if (!version) continue;

    try {
      await db().transaction(async (tx) => {
        await recordResolvedQuestion(tx, {
          sessionId: session.id,
          userId: session.ownerId,
          gameTypeId: session.gameTypeId,
          questionVersionId: question.questionVersionId,
          position: question.position,
          categoryId: version.categoryId,
          subTopic: version.subTopic,
          difficultyRating: version.rating,
          outcome: 'TIMEOUT',
          correctness: 0,
          speedFactor: '0.5',
          responseJson: null,
          responseTimeMs: null,
          // The deadline, not "now": that is when the question actually
          // lapsed, and it keeps the event ordering stable however late the
          // sweep or the next request arrives.
          serverReceivedAt: question.deadlineAt ?? at,
          clientSentAt: null,
        });
      });
      resolved += 1;
      logger.info(
        { session_id: session.id, position: question.position },
        'question.resolved_timeout',
      );
    } catch (error) {
      if (
        isUniqueViolation(error, 'answers_session_user_version_unique') ||
        isUniqueViolation(error, 'learning_events_session_user_source_unique')
      ) {
        // Another request resolved it first. Nothing to do.
        continue;
      }
      throw error;
    }
  }
  return resolved;
}
