import 'server-only';
import {
  AppError,
  COMPLETION_BONUS,
  QUALIFYING_ANSWERED_RATIO,
  SOLO_QUESTION_COUNT,
  computePoints,
  localDateFor,
  type PointsBreakdown,
  type ReviewItem,
  type SessionResult,
} from '@learnarena/core';
import {
  addToCachedTotal,
  findLedgerRowByKey,
  insertLedgerRow,
  listAnswers,
  listSessionQuestions,
  loadQuestionVersions,
  lockSession,
  requireTransition,
  sessionCompletionKey,
  type AnswerRecord,
  type GradableQuestion,
  type SessionQuestionRecord,
  type UserRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { sendSessionTerminal } from '../inngest/events';
import { categorySlugForId } from './categories';
import { NO_OP_COMPLETION_STEPS, type CompletionSteps } from './hooks';
import { findExpiredServed, resolveTimeouts } from './resolveTimeout';

/**
 * The session completion transaction (PLANNING.md §18.2).
 *
 * One transaction, opened with `SELECT … FOR UPDATE` on the session row. That
 * lock is what makes concurrent `/complete` calls safe: the first request
 * holds the row while it writes the ledger row and flips the status; the rest
 * block, then observe `COMPLETED` and return the stored `result_json` without
 * writing anything (§18.1, Invariant 2).
 *
 * The ledger's `idempotency_key` UNIQUE is the second line of defence, so even
 * a lock that somehow failed could not produce two awards.
 */

export interface CompleteSessionResult {
  result: SessionResult;
  /** False when this call found the session already completed. */
  awarded: boolean;
}

export async function completeSession(
  user: UserRecord,
  sessionId: string,
  at: Date,
  steps: CompletionSteps = NO_OP_COMPLETION_STEPS,
): Promise<CompleteSessionResult> {
  // Resolve lapsed questions before opening the transaction. They are separate
  // writes (§8.2) and doing them here keeps the locked section short.
  await resolveLapsedQuestions(sessionId, user.id, at);

  const outcome = await db().transaction(async (tx) => {
    // ---- Step 1: lock -----------------------------------------------------
    const session = await lockSession(tx, sessionId);
    if (!session || session.ownerId !== user.id) {
      throw new AppError('SESSION_NOT_FOUND');
    }

    // ---- Step 2: terminal states -----------------------------------------
    if (session.status === 'COMPLETED') {
      // §16.3: "/complete on a COMPLETED session → 200 with the stored
      // result_json." No writes at all.
      const stored = session.resultJson as SessionResult | null;
      if (stored) return { result: stored, awarded: false };
      // §14.3 allows result_json to be regenerated if it is ever missing.
      logger.warn({ session_id: sessionId }, 'session.result_json_missing');
    } else if (session.status !== 'ACTIVE') {
      throw new AppError('INVALID_SESSION_STATE', {
        message: 'This session cannot be completed.',
        details: { status: session.status },
      });
    }

    const questions = await listSessionQuestions(tx, sessionId);
    const answers = await listAnswers(tx, sessionId);

    // ---- Step 3: every question must be resolved -------------------------
    const answeredVersionIds = new Set(answers.map((answer) => answer.questionVersionId));
    const unresolved = questions.filter(
      (question) => !answeredVersionIds.has(question.questionVersionId),
    );
    if (unresolved.length > 0) {
      throw new AppError('SESSION_NOT_FINISHED', {
        details: {
          unresolved: unresolved.length,
          // An unserved question means the learner has more to play; a served
          // one is simply still inside its window.
          unserved: unresolved.filter((question) => question.servedAt === null).length,
        },
      });
    }

    // ---- Step 4: local date and qualification ----------------------------
    const localDate = localDateFor(user.timezone, at);
    const answeredCount = answers.filter((answer) => answer.outcome === 'ANSWERED').length;
    const questionCount = questions.length || SOLO_QUESTION_COUNT;
    const isQualifying = answeredCount / questionCount >= QUALIFYING_ANSWERED_RATIO;

    const correctnessValues = answers.map((answer) => Number(answer.correctness));
    const sessionAccuracy =
      correctnessValues.reduce((total, value) => total + value, 0) / questionCount;

    const stepContext = {
      tx,
      sessionId,
      userId: user.id,
      categoryId: session.categoryId,
      localDate,
      isQualifying,
      sessionAccuracy,
      weaknessTierSnapshot: session.weaknessTier,
      now: at,
    };

    // ---- Steps 5, 6, 7: no-op interfaces until Phases 2 and 3 ------------
    const { streakMultiplier, streak } = await steps.streak.apply(stepContext);
    const { tierMultiplier, recommendationCompleted } =
      await steps.recommendation.resolve(stepContext);
    const { improvementBonus } = await steps.improvement.evaluate(stepContext);

    // ---- Step 8: compute and award ---------------------------------------
    const breakdown = computePoints({
      questions: answers.map((answer) => ({
        correctness: Number(answer.correctness),
        speedFactor: Number(answer.speedFactor),
      })),
      completionBonus: COMPLETION_BONUS,
      multipliers: {
        streak: streakMultiplier,
        friend: 1, // §10.1: "Always 1.0 in solo."
        weakness: tierMultiplier + improvementBonus,
        event: 1, // §10.1: "Fixed 1.0 before V1."
      },
    });

    const idempotencyKey = sessionCompletionKey(sessionId, user.id);
    const inserted = await insertLedgerRow(tx, {
      userId: user.id,
      sessionId,
      reason: 'SESSION_COMPLETION',
      breakdown,
      idempotencyKey,
      now: at,
    });

    if (!inserted) {
      // The key already exists, so this session was awarded by an earlier
      // call. Never award twice (Invariant 2).
      const existing = await findLedgerRowByKey(tx, idempotencyKey);
      logger.warn({ session_id: sessionId, ledger_id: existing?.id }, 'session.duplicate_complete');
      const stored = session.resultJson as SessionResult | null;
      if (stored) return { result: stored, awarded: false };
    } else {
      // ---- Step 9: advance the cached total ------------------------------
      await addToCachedTotal(tx, user.id, breakdown.finalPoints, at);
    }

    const versions = await loadQuestionVersions(
      tx,
      questions.map((question) => question.questionVersionId),
    );

    const result: SessionResult = {
      sessionId,
      categorySlug: await categorySlugForId(tx, session.categoryId),
      finalPoints: breakdown.finalPoints,
      pointsBreakdown: breakdown,
      accuracy: sessionAccuracy,
      answeredCount,
      timedOutCount: answers.filter((answer) => answer.outcome === 'TIMEOUT').length,
      correctCount: answers.filter((answer) => Number(answer.correctness) === 1).length,
      questionCount,
      isQualifying,
      localDate,
      streak,
      recommendationCompleted,
      review: buildReview(questions, answers, versions),
    };

    // ---- Step 10: mark COMPLETED -----------------------------------------
    await requireTransition(tx, sessionId, 'ACTIVE', 'COMPLETED', {
      endedAt: at,
      localDate,
      isQualifying,
      resultJson: result,
      lastActivityAt: at,
    });

    logger.info(
      {
        session_id: sessionId,
        user_id: user.id,
        final_points: breakdown.finalPoints,
        cap_applied: breakdown.capApplied,
      },
      'session.completed',
    );

    return { result, awarded: true };
    // ---- Step 11: commit (leaving this block) ----------------------------
  });

  // §18.3: post-commit, after the award is durable. Never throws (see
  // lib/inngest/events.ts); a lost send is recovered by sessions/reconcile.
  if (outcome.awarded) {
    await sendSessionTerminal(sessionId);
  }

  return outcome;
}

/**
 * Resolve any question whose window closed while the learner was away, so
 * step 3 sees a complete session (§18.2 step 3, §8.2).
 */
async function resolveLapsedQuestions(sessionId: string, userId: string, at: Date): Promise<void> {
  const [questions, answers] = await Promise.all([
    listSessionQuestions(db(), sessionId),
    listAnswers(db(), sessionId),
  ]);

  const answeredVersionIds = new Set(answers.map((answer) => answer.questionVersionId));
  const expired = findExpiredServed(questions, answeredVersionIds, at);
  if (expired.length === 0) return;

  const session = await db().query.gameSessions.findFirst({
    where: (table, { eq }) => eq(table.id, sessionId),
  });
  if (!session || session.ownerId !== userId) return;

  await resolveTimeouts(
    {
      ...session,
      status: session.status,
    },
    expired,
    at,
  );
}

/**
 * The missed-question review (§20 screen 6, §24: "a review of every missed
 * question with its explanation").
 *
 * Renders from the `question_version_id` that was actually served, so a
 * version archived since the session still shows what the learner saw
 * (Invariant 11).
 */
function buildReview(
  questions: readonly SessionQuestionRecord[],
  answers: readonly AnswerRecord[],
  versions: ReadonlyMap<string, GradableQuestion>,
): ReviewItem[] {
  const byVersionId = new Map(answers.map((answer) => [answer.questionVersionId, answer]));

  return questions
    .map((question) => {
      const answer = byVersionId.get(question.questionVersionId);
      const version = versions.get(question.questionVersionId);
      if (!answer || !version) return null;
      // Only *missed* questions appear in the review.
      if (Number(answer.correctness) === 1) return null;

      return {
        position: question.position,
        questionVersionId: question.questionVersionId,
        prompt: version.prompt,
        type: version.type,
        yourAnswer: renderResponse(version, answer),
        correctAnswer: renderCorrectAnswer(version),
        explanation: version.explanation,
        timedOut: answer.outcome === 'TIMEOUT',
        subTopic: version.subTopic,
      } satisfies ReviewItem;
    })
    .filter((item): item is ReviewItem => item !== null)
    .sort((a, b) => a.position - b.position);
}

function renderResponse(version: GradableQuestion, answer: AnswerRecord): string | null {
  if (answer.outcome === 'TIMEOUT' || answer.responseJson === null) return null;

  const response = answer.responseJson as { optionId?: string; value?: string };
  if (version.type === 'MCQ') {
    const option = version.options?.find((entry) => entry.id === response.optionId);
    return option?.text ?? response.optionId ?? null;
  }
  return response.value ?? null;
}

function renderCorrectAnswer(version: GradableQuestion): string {
  const key = version.answerJson as { correctOptionId?: string; value?: string };
  if (version.type === 'MCQ') {
    const option = version.options?.find((entry) => entry.id === key.correctOptionId);
    return option?.text ?? key.correctOptionId ?? '';
  }
  return key.value ?? '';
}

export type { PointsBreakdown };
