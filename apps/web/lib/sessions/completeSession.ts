import { and, eq } from 'drizzle-orm';
import 'server-only';
import {
  AppError,
  COMPLETION_BONUS,
  QUALIFYING_ANSWERED_RATIO,
  SOLO_QUESTION_COUNT,
  computePoints,
  localDateFor,
  streakStateFor,
  type PointsBreakdown,
  type ReviewItem,
  type SessionResult,
} from '@learnarena/core';
import {
  addToCachedTotal,
  gameSessions,
  pointLedger,
  recommendations,
  loadStreakData,
  type Database,
  type SessionRecord,
  activeEventMultiplier,
  activityForSession,
  listActivityAssessments,
  serveActivity,
  dailyBonusKey,
  findDailyChallengeById,
  findLedgerRowByKey,
  insertLedgerRow,
  listAnswers,
  listSessionQuestions,
  loadQuestionVersions,
  lockSession,
  lockStreakUser,
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
import { COMPLETION_STEPS, type CompletionSteps } from './hooks';
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
  steps: CompletionSteps = COMPLETION_STEPS,
): Promise<CompleteSessionResult> {
  // Resolve lapsed questions before opening the transaction. They are separate
  // writes (§8.2) and doing them here keeps the locked section short.
  const activityInfo = await activityForSession(db(), sessionId);
  if (activityInfo) {
    if (
      !activityInfo.activity.finished &&
      activityInfo.activity.deadlineAt &&
      at >= activityInfo.activity.deadlineAt
    )
      await db().transaction((tx) => serveActivity(tx, sessionId, user.id, at));
  } else await resolveLapsedQuestions(sessionId, user.id, at);

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
      return { result: await restoreCompletedResult(tx, session), awarded: false };
    } else if (session.status !== 'ACTIVE') {
      throw new AppError('INVALID_SESSION_STATE', {
        message: 'This session cannot be completed.',
        details: { status: session.status },
      });
    }

    const activity = activityInfo ? await activityForSession(tx, sessionId) : undefined;
    if (activity && !activity.activity.finished) throw new AppError('SESSION_NOT_FINISHED');
    const assessments = activity ? await listActivityAssessments(tx, sessionId) : [];
    const questions: SessionQuestionRecord[] = activity
      ? assessments.map((a) => ({
          sessionId,
          position: a.position,
          questionVersionId: a.id,
          servedAt: a.servedAt,
          deadlineAt: a.deadlineAt,
        }))
      : await listSessionQuestions(tx, sessionId);
    const answers: AnswerRecord[] = activity
      ? assessments
          .filter((a) => a.outcome !== null)
          .map((a) => ({
            id: a.id,
            sessionId,
            userId: user.id,
            questionVersionId: a.id,
            position: a.position,
            outcome: a.outcome!,
            responseJson: a.responseJson,
            correctness: a.correctness!,
            speedFactor: a.speedFactor!,
            responseTimeMs: a.resolvedAt!.getTime() - a.servedAt.getTime(),
            serverReceivedAt: a.resolvedAt!,
          }))
      : await listAnswers(tx, sessionId);

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
    const currentUser = await lockStreakUser(tx, user.id);
    const localDate = localDateFor(currentUser!.timezone, at);
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

    // ---- Steps 5, 6, 7 --------------------------------------------------
    // Credit streak and resolve recommendation/improvement inside this transaction.
    const { streakMultiplier, streak } = await steps.streak.apply(stepContext);
    const { tierMultiplier, resolvedTier, recommendationCompleted } =
      await steps.recommendation.resolve(stepContext);
    const { improvementBonus, baseline } = await steps.improvement.evaluate(stepContext);

    // ---- Step 8: compute and award ---------------------------------------
    const event = await activeEventMultiplier(tx, at);
    const breakdown = computePoints({
      questions: answers.map((answer) => ({
        correctness: Number(answer.correctness),
        speedFactor: Number(answer.speedFactor),
      })),
      comboEnabled: activity?.version.kind !== 'dialogue_scenario',
      completionBonus: COMPLETION_BONUS + (activity?.activity.bestEnding ? 50 : 0),
      multipliers: {
        streak: streakMultiplier,
        friend: 1, // §10.1: "Always 1.0 in solo."
        weakness: tierMultiplier + improvementBonus,
        event: event?.multiplier ?? 1,
      },
    });

    if (event) breakdown.event = event;
    const weaknessExplanation = {
      snapshotTier: session.weaknessTier,
      resolvedTier,
      tierMultiplier,
      improvementBonus,
      improvementBaseline: baseline,
    };
    breakdown.completionContext = {
      streak,
      weakness: weaknessExplanation,
      recommendationCompleted,
    };
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

    let dailyChallengeBonus = 0;
    if (session.dailyChallengeId) {
      const challenge = await findDailyChallengeById(tx, session.dailyChallengeId);
      if (challenge) {
        const bonus = computePoints({
          questions: [],
          completionBonus: 100,
          multipliers: { streak: 1, friend: 1, weakness: 1, event: 1 },
        });
        const granted = await insertLedgerRow(tx, {
          userId: user.id,
          sessionId,
          reason: 'DAILY_CHALLENGE_BONUS',
          breakdown: bonus,
          idempotencyKey: dailyBonusKey(challenge.challengeDate, user.id),
          now: at,
        });
        if (granted) {
          dailyChallengeBonus = 100;
          await addToCachedTotal(tx, user.id, 100, at);
        }
      }
    }

    const versions = await loadQuestionVersions(
      tx,
      questions.map((question) => question.questionVersionId),
    );

    // §10.4: the breakdown has to explain *why* the weakness multiplier took
    // its value, or an award cannot be reconstructed from the ledger alone.

    const result: SessionResult = {
      sessionId,
      categorySlug: await categorySlugForId(tx, session.categoryId),
      finalPoints: breakdown.finalPoints,
      dailyChallengeBonus,
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
      weakness: weaknessExplanation,
      review: activity
        ? assessments
            .filter((a) => Number(a.correctness) < 1)
            .map((a) => ({
              position: a.position,
              questionVersionId: a.id,
              prompt: a.prompt,
              type: 'NUMERIC' as const,
              yourAnswer: JSON.stringify(a.responseJson),
              correctAnswer: (a.resultJson as { correctAnswer: string }).correctAnswer,
              explanation: (a.resultJson as { explanation: string }).explanation,
              timedOut: a.outcome === 'TIMEOUT',
              subTopic: null,
            }))
        : buildReview(questions, answers, versions),
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
    await sendSessionTerminal(sessionId, user.id);
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

/** Rebuild a disposable result cache without replaying any reward or transition. */
export async function restoreCompletedResult(
  tx: Database,
  session: SessionRecord,
): Promise<SessionResult> {
  if (session.status !== 'COMPLETED' || session.mode !== 'SOLO')
    throw new AppError('INVALID_SESSION_STATE');
  const ledger = await findLedgerRowByKey(tx, sessionCompletionKey(session.id, session.ownerId));
  if (!ledger)
    throw new AppError('INTERNAL_ERROR', {
      message: 'The canonical score for this session is missing.',
    });
  const breakdown = ledger.multipliersJson as PointsBreakdown;
  const activity = await activityForSession(tx, session.id);
  const assessments = activity ? await listActivityAssessments(tx, session.id) : [];
  const questions: SessionQuestionRecord[] = activity
    ? assessments.map((a) => ({
        sessionId: session.id,
        position: a.position,
        questionVersionId: a.id,
        servedAt: a.servedAt,
        deadlineAt: a.deadlineAt,
      }))
    : await listSessionQuestions(tx, session.id);
  const answers: AnswerRecord[] = activity
    ? assessments
        .filter((a) => a.outcome !== null)
        .map((a) => ({
          id: a.id,
          sessionId: session.id,
          userId: session.ownerId,
          questionVersionId: a.id,
          position: a.position,
          outcome: a.outcome!,
          responseJson: a.responseJson,
          correctness: a.correctness!,
          speedFactor: a.speedFactor!,
          responseTimeMs: a.resolvedAt!.getTime() - a.servedAt.getTime(),
          serverReceivedAt: a.resolvedAt!,
        }))
    : await listAnswers(tx, session.id);
  const endedAt = session.endedAt ?? ledger.createdAt;
  const date = session.localDate ?? endedAt.toISOString().slice(0, 10);
  const { days, freezes } = await loadStreakData(tx, session.ownerId);
  const historicalDays = days.filter((d) => d.createdAt <= endedAt);
  const historicalFreezes = freezes
    .filter((f) => f.createdAt <= endedAt)
    .map((f) => ({
      ...f,
      status: f.consumedAt && f.consumedAt > endedAt ? 'AVAILABLE' : f.status,
    }));
  const streak = breakdown.completionContext
    ? breakdown.completionContext.streak
    : {
        ...streakStateFor(historicalDays, historicalFreezes, date),
        credited: historicalDays.some((d) => d.sessionId === session.id),
        milestone: null,
      };
  const [rec] = await tx
    .select()
    .from(recommendations)
    .where(eq(recommendations.completedSessionId, session.id));
  const resolvedTier = rec ? 'RECOMMENDED' : session.weaknessTier === 'NONE' ? 'NONE' : 'WEAK';
  const tierMultiplier = resolvedTier === 'RECOMMENDED' ? 1.5 : resolvedTier === 'WEAK' ? 1.25 : 1;
  const versions = await loadQuestionVersions(
    tx,
    questions.map((q) => q.questionVersionId),
  );
  const [bonus] = await tx
    .select()
    .from(pointLedger)
    .where(
      and(
        eq(pointLedger.sessionId, session.id),
        eq(pointLedger.userId, session.ownerId),
        eq(pointLedger.reason, 'DAILY_CHALLENGE_BONUS'),
      ),
    );
  const count = questions.length || 1;
  const result: SessionResult = {
    sessionId: session.id,
    categorySlug: await categorySlugForId(tx, session.categoryId),
    finalPoints: ledger.finalPoints,
    dailyChallengeBonus: bonus?.finalPoints ?? 0,
    pointsBreakdown: breakdown,
    accuracy: answers.reduce((sum, a) => sum + Number(a.correctness), 0) / count,
    answeredCount: answers.filter((a) => a.outcome === 'ANSWERED').length,
    timedOutCount: answers.filter((a) => a.outcome === 'TIMEOUT').length,
    correctCount: answers.filter((a) => Number(a.correctness) === 1).length,
    questionCount: questions.length,
    isQualifying: session.isQualifying ?? false,
    localDate: date,
    streak,
    recommendationCompleted: breakdown.completionContext?.recommendationCompleted ?? !!rec,
    weakness: breakdown.completionContext?.weakness ?? {
      snapshotTier: session.weaknessTier,
      resolvedTier,
      tierMultiplier,
      improvementBonus: Math.max(0, breakdown.multipliers.weakness - tierMultiplier),
      improvementBaseline: null,
    },
    review: activity
      ? assessments
          .filter((a) => Number(a.correctness) < 1)
          .map((a) => ({
            position: a.position,
            questionVersionId: a.id,
            prompt: a.prompt,
            type: 'NUMERIC',
            yourAnswer: JSON.stringify(a.responseJson),
            correctAnswer: (a.resultJson as { correctAnswer: string }).correctAnswer,
            explanation: (a.resultJson as { explanation: string }).explanation,
            timedOut: a.outcome === 'TIMEOUT',
            subTopic: null,
          }))
      : buildReview(questions, answers, versions),
  };
  await tx
    .update(gameSessions)
    .set({ resultJson: result })
    .where(and(eq(gameSessions.id, session.id), eq(gameSessions.status, 'COMPLETED')));
  return result;
}
