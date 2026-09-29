import 'server-only';
import {
  ANSWER_GRACE_MS,
  AppError,
  ResponseShapeError,
  SOLO_TIME_LIMIT_MS,
  canonicalJson,
  comboAfter,
  gradeAnswer,
  speedFactor,
  timeLeftMs,
  type AnswerKey,
  type AnswerResponse,
  type SubmitAnswerRequest,
  type SubmitAnswerResponse,
} from '@learnarena/core';
import {
  isUniqueViolation,
  listAnswers,
  listSessionQuestions,
  loadQuestionVersions,
  recordResolvedQuestion,
  touchSession,
  type SessionRecord,
} from '@learnarena/db';
import { db } from '../db';
import { logger } from '../logger';
import { findExpiredServed, resolveTimeouts } from './resolveTimeout';

/**
 * Answer submission and grading (PLANNING.md §8.1, §8.2, §16.3).
 *
 * Every decision here is the server's: correctness, the speed factor from
 * `server_received_at`, and whether the answer arrived in time (Invariant 1,
 * §5.13). `clientSentAt` is stored only as a diagnostic.
 */

export async function submitAnswer(
  session: SessionRecord,
  request: SubmitAnswerRequest,
  serverReceivedAt: Date,
): Promise<SubmitAnswerResponse> {
  if (session.status === 'COMPLETED') {
    throw new AppError('SESSION_ALREADY_COMPLETED');
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('INVALID_SESSION_STATE', {
      message:
        session.status === 'CREATED'
          ? 'No question has been served yet.'
          : 'This session is no longer in progress.',
      details: { status: session.status },
    });
  }

  const questions = await listSessionQuestions(db(), session.id);
  const target = questions.find((question) => question.position === request.position);

  // §16.1 QUESTION_NOT_CURRENT: "Answer for a question that isn't the
  // currently served one". A bad position or a mismatched version id both mean
  // the client is not where it thinks it is.
  if (!target || target.questionVersionId !== request.questionVersionId) {
    throw new AppError('QUESTION_NOT_CURRENT', { details: { position: request.position } });
  }

  const existingAnswers = await listAnswers(db(), session.id);
  const already = existingAnswers.find(
    (answer) => answer.questionVersionId === request.questionVersionId,
  );

  const versions = await loadQuestionVersions(db(), [target.questionVersionId]);
  const version = versions.get(target.questionVersionId);
  if (!version) {
    throw new AppError('INTERNAL_ERROR', { message: 'That question could not be loaded.' });
  }

  // §16.3 duplicate-submission semantics.
  if (already) {
    const sameResponse =
      already.responseJson !== null &&
      canonicalJson(already.responseJson) === canonicalJson(request.response);

    if (!sameResponse) {
      throw new AppError('ANSWER_ALREADY_SUBMITTED', {
        details: { position: request.position },
      });
    }

    // An identical retry replays the original result rather than re-grading.
    logger.info({ session_id: session.id, position: request.position }, 'answer.duplicate');
    return buildResponse({
      correctness: Number(already.correctness),
      correctAnswer: correctAnswerFor(version),
      explanation: version.explanation,
      speedFactor: Number(already.speedFactor),
      allAnswers: existingAnswers.map((answer) => Number(answer.correctness)),
      questionCount: questions.length,
      resolvedCount: existingAnswers.length,
    });
  }

  if (target.servedAt === null || target.deadlineAt === null) {
    // Answering something that was never served.
    throw new AppError('QUESTION_NOT_CURRENT', { details: { position: request.position } });
  }

  // §8.2: accepted up to `deadline_at + 1000 ms`; after that the question is
  // resolved as TIMEOUT and the submission is rejected.
  const pastGrace = serverReceivedAt.getTime() > target.deadlineAt.getTime() + ANSWER_GRACE_MS;
  if (pastGrace) {
    await resolveTimeouts(session, [target], serverReceivedAt);
    throw new AppError('QUESTION_EXPIRED', {
      details: { position: request.position },
    });
  }

  // An earlier question may have lapsed while this one was open; resolve it so
  // the combo is computed over a complete history.
  const answeredVersionIds = new Set(existingAnswers.map((answer) => answer.questionVersionId));
  const expired = findExpiredServed(questions, answeredVersionIds, serverReceivedAt).filter(
    (question) => question.position !== target.position,
  );
  if (expired.length > 0) {
    await resolveTimeouts(session, expired, serverReceivedAt);
  }

  let graded;
  try {
    graded = gradeAnswer(
      version.type,
      version.answerJson as AnswerKey,
      request.response as AnswerResponse,
      version.options ?? undefined,
    );
  } catch (error) {
    if (error instanceof ResponseShapeError) {
      // The response does not fit the question's type — a client bug, not a
      // wrong answer (§16.1 INVALID_INPUT).
      throw new AppError('INVALID_INPUT', { message: error.message });
    }
    throw error;
  }

  const timeLimitMs = session.timeLimitMs ?? SOLO_TIME_LIMIT_MS;
  const left = timeLeftMs(target.deadlineAt, serverReceivedAt);
  const factor = speedFactor(left, timeLimitMs);
  const responseTimeMs = serverReceivedAt.getTime() - target.servedAt.getTime();

  try {
    await db().transaction(async (tx) => {
      // §9: the answer and its learning event, one transaction.
      await recordResolvedQuestion(tx, {
        sessionId: session.id,
        userId: session.ownerId,
        gameTypeId: session.gameTypeId,
        questionVersionId: target.questionVersionId,
        position: target.position,
        categoryId: version.categoryId,
        subTopic: version.subTopic,
        difficultyRating: version.rating,
        outcome: 'ANSWERED',
        correctness: graded.correctness,
        speedFactor: factor,
        responseJson: request.response,
        responseTimeMs,
        serverReceivedAt,
        clientSentAt: request.clientSentAt ? new Date(request.clientSentAt) : null,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, 'answers_session_user_version_unique')) {
      // A concurrent identical submission won. §16.3 says an identical retry
      // gets the stored result, so re-read and return it.
      const stored = await listAnswers(db(), session.id);
      const winner = stored.find(
        (answer) => answer.questionVersionId === target.questionVersionId,
      )!;
      return buildResponse({
        correctness: Number(winner.correctness),
        correctAnswer: correctAnswerFor(version),
        explanation: version.explanation,
        speedFactor: Number(winner.speedFactor),
        allAnswers: stored.map((answer) => Number(answer.correctness)),
        questionCount: questions.length,
        resolvedCount: stored.length,
      });
    }
    throw error;
  }

  await touchSession(db(), session.id, serverReceivedAt);

  const after = await listAnswers(db(), session.id);
  logger.info(
    {
      session_id: session.id,
      position: target.position,
      correctness: graded.correctness,
    },
    'answer.submitted',
  );

  return buildResponse({
    correctness: graded.correctness,
    correctAnswer: graded.correctAnswer,
    explanation: version.explanation,
    speedFactor: Number(factor),
    allAnswers: after.map((answer) => Number(answer.correctness)),
    questionCount: questions.length,
    resolvedCount: after.length,
  });
}

function correctAnswerFor(version: {
  type: 'MCQ' | 'NUMERIC';
  answerJson: unknown;
  options: { id: string; text: string }[] | null;
}): string {
  const key = version.answerJson as AnswerKey;
  if (version.type === 'MCQ') {
    const correctId = (key as { correctOptionId: string }).correctOptionId;
    return version.options?.find((option) => option.id === correctId)?.text ?? correctId;
  }
  return (key as { value: string }).value;
}

function buildResponse(input: {
  correctness: number;
  correctAnswer: string;
  explanation: string;
  speedFactor: number;
  allAnswers: number[];
  questionCount: number;
  resolvedCount: number;
}): SubmitAnswerResponse {
  return {
    correct: input.correctness === 1,
    correctness: input.correctness,
    correctAnswer: input.correctAnswer,
    explanation: input.explanation,
    speedFactor: input.speedFactor,
    comboAfter: comboAfter(input.allAnswers),
    sessionFinished: input.resolvedCount >= input.questionCount,
  };
}
