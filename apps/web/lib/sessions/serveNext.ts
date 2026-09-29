import 'server-only';
import {
  ANSWER_GRACE_MS,
  AppError,
  SOLO_TIME_LIMIT_MS,
  type ServedQuestionPayload,
} from '@learnarena/core';
import {
  listAnswers,
  listSessionQuestions,
  loadQuestionVersions,
  markQuestionServed,
  toServedQuestion,
  transitionSession,
  touchSession,
  type SessionRecord,
} from '@learnarena/db';
import { db } from '../db';
import { findExpiredServed, resolveTimeouts } from './resolveTimeout';

/**
 * Serving the next question (PLANNING.md §8.1, §18.1).
 *
 * "Questions are served **one at a time**. The server records `served_at` and
 *  `deadline_at` when each question is served. Answer keys are never sent
 *  before the answer is graded."
 *
 * Idempotent per §18.1: "Returns the currently open question if `served_at` is
 * set and it's unresolved; never serves two at once." A retry therefore does
 * not hand the learner extra time — the original deadline stands.
 */

export interface ServeNextResult {
  position: number;
  question: ServedQuestionPayload;
  deadlineAt: string;
  servedAt: string;
  timeLimitMs: number;
  questionCount: number;
  /** How many of the session's questions already have an outcome. */
  resolvedCount: number;
}

export async function serveNextQuestion(
  session: SessionRecord,
  at: Date,
): Promise<ServeNextResult> {
  if (session.status === 'COMPLETED') {
    throw new AppError('SESSION_ALREADY_COMPLETED');
  }
  if (session.status !== 'CREATED' && session.status !== 'ACTIVE') {
    throw new AppError('INVALID_SESSION_STATE', {
      message: 'This session is no longer in progress.',
      details: { status: session.status },
    });
  }

  // Resolve anything that lapsed while the learner was away, so the state we
  // reason about below is current (§8.2).
  let questions = await listSessionQuestions(db(), session.id);
  let answers = await listAnswers(db(), session.id);
  let answeredVersionIds = new Set(answers.map((answer) => answer.questionVersionId));

  const expired = findExpiredServed(questions, answeredVersionIds, at);
  if (expired.length > 0) {
    await resolveTimeouts(session, expired, at);
    answers = await listAnswers(db(), session.id);
    answeredVersionIds = new Set(answers.map((answer) => answer.questionVersionId));
  }

  // The currently open question: served, unresolved, still inside its window.
  const open = questions.find(
    (question) => question.servedAt !== null && !answeredVersionIds.has(question.questionVersionId),
  );

  const target = open ?? questions.find((question) => question.servedAt === null);

  if (!target) {
    // Everything is resolved. §16.2 does not name a code for this; the client
    // should have followed `sessionFinished` from /answer to /complete.
    throw new AppError('INVALID_SESSION_STATE', {
      message: 'Every question in this session has been answered.',
      details: { sessionFinished: true },
    });
  }

  const timeLimitMs = session.timeLimitMs ?? SOLO_TIME_LIMIT_MS;

  let servedAt = target.servedAt;
  let deadlineAt = target.deadlineAt;

  if (servedAt === null) {
    servedAt = at;
    deadlineAt = new Date(at.getTime() + timeLimitMs);

    // Guarded on `served_at IS NULL`: if a concurrent request served it first,
    // this matches nothing and we re-read its timestamps rather than
    // overwriting them with a fresh, longer deadline.
    const claimed = await markQuestionServed(
      db(),
      session.id,
      target.position,
      servedAt,
      deadlineAt,
    );

    if (!claimed) {
      questions = await listSessionQuestions(db(), session.id);
      const current = questions.find((question) => question.position === target.position)!;
      servedAt = current.servedAt!;
      deadlineAt = current.deadlineAt!;
    }

    // §15.1: the first question served is what makes a session ACTIVE.
    if (session.status === 'CREATED') {
      await transitionSession(db(), session.id, 'CREATED', 'ACTIVE', {
        startedAt: at,
        lastActivityAt: at,
      });
    } else {
      await touchSession(db(), session.id, at);
    }
  }

  const versions = await loadQuestionVersions(db(), [target.questionVersionId]);
  const version = versions.get(target.questionVersionId);
  if (!version) {
    throw new AppError('INTERNAL_ERROR', {
      message: 'The question for this position could not be loaded.',
    });
  }

  return {
    position: target.position,
    // The ONLY way a question reaches a learner. `toServedQuestion` projects
    // away `answer_json` and `explanation` (Invariant 1, §8.1).
    question: toServedQuestion(version),
    deadlineAt: deadlineAt!.toISOString(),
    servedAt: servedAt.toISOString(),
    timeLimitMs,
    questionCount: questions.length,
    resolvedCount: answeredVersionIds.size,
  };
}

/** Milliseconds a client may still answer within, including the grace window. */
export function remainingWindowMs(deadlineAt: Date, at: Date): number {
  return Math.max(0, deadlineAt.getTime() + ANSWER_GRACE_MS - at.getTime());
}
