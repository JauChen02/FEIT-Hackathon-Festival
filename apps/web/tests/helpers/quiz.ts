/**
 * Helpers for driving a solo quiz through the real route handlers.
 *
 * Everything here goes through the HTTP surface — no repository shortcuts — so
 * the tests exercise the same path a browser would.
 */

import { eq } from 'drizzle-orm';
import { uuidv7, type NextQuestionResponse, type SubmitAnswerResponse } from '@learnarena/core';
import { questionVersions } from '@learnarena/db/schema';
import { POST as createSessionRoute } from '@/app/api/sessions/route';
import { POST as nextRoute } from '@/app/api/sessions/[id]/next/route';
import { POST as answerRoute } from '@/app/api/sessions/[id]/answer/route';
import { POST as completeRoute } from '@/app/api/sessions/[id]/complete/route';
import type { Database } from '@learnarena/db';
import { jsonRequest, readResponse, type ParsedResponse } from './testApp';

/** Next.js passes dynamic segments as a promise. */
export const withId = (id: string) => ({ params: Promise.resolve({ id }) });

export async function createSession(
  categorySlug = 'math',
  idempotencyKey = uuidv7(),
): Promise<ParsedResponse<{ sessionId: string; questionCount: number; timeLimitMs: number }>> {
  return readResponse(
    await createSessionRoute(
      jsonRequest('/api/sessions', {
        method: 'POST',
        body: { gameType: 'quiz_solo', categorySlug },
        headers: { 'idempotency-key': idempotencyKey },
      }),
    ),
  );
}

export async function serveNext(sessionId: string): Promise<ParsedResponse<NextQuestionResponse>> {
  return readResponse(
    await nextRoute(
      jsonRequest(`/api/sessions/${sessionId}/next`, { method: 'POST' }),
      withId(sessionId),
    ),
  );
}

export async function submitAnswer(
  sessionId: string,
  body: Record<string, unknown>,
): Promise<ParsedResponse<SubmitAnswerResponse>> {
  return readResponse(
    await answerRoute(
      jsonRequest(`/api/sessions/${sessionId}/answer`, { method: 'POST', body }),
      withId(sessionId),
    ),
  );
}

export async function complete(
  sessionId: string,
): Promise<ParsedResponse<Record<string, unknown>>> {
  return readResponse(
    await completeRoute(
      jsonRequest(`/api/sessions/${sessionId}/complete`, { method: 'POST' }),
      withId(sessionId),
    ),
  );
}

/**
 * Build the response payload that answers the served question correctly (or
 * deliberately wrongly), by reading the answer key straight from the database.
 *
 * Tests need to know the right answer; the *client* must not, which is what
 * answerKeyLeak.test.ts asserts separately.
 */
export async function responseFor(
  db: Database,
  question: NextQuestionResponse['question'],
  correct: boolean,
): Promise<Record<string, string>> {
  const rows = await db
    .select({ answerJson: questionVersions.answerJson, optionsJson: questionVersions.optionsJson })
    .from(questionVersions)
    .where(eq(questionVersions.id, question.id))
    .limit(1);

  const key = rows[0]!.answerJson as { correctOptionId?: string; value?: string };

  if (question.type === 'MCQ') {
    const options = (rows[0]!.optionsJson as { id: string }[]) ?? [];
    if (correct) return { optionId: key.correctOptionId! };
    const wrong = options.find((option) => option.id !== key.correctOptionId);
    return { optionId: wrong?.id ?? 'z' };
  }

  if (correct) return { value: key.value! };
  // A value that is definitely not the answer, and outside any tolerance.
  return { value: String(Number(key.value) + 1000) };
}

export interface PlayOptions {
  /** Which positions to answer correctly. Default: all of them. */
  correctPositions?: (position: number) => boolean;
}

/**
 * Serve and answer every question in a session, returning each answer result.
 */
export async function playAllQuestions(
  db: Database,
  sessionId: string,
  options: PlayOptions = {},
): Promise<SubmitAnswerResponse[]> {
  const isCorrect = options.correctPositions ?? (() => true);
  const results: SubmitAnswerResponse[] = [];

  for (let i = 0; i < 100; i += 1) {
    const served = await serveNext(sessionId);
    if (served.status !== 200) break;

    const response = await responseFor(db, served.body.question, isCorrect(served.body.position));
    const answered = await submitAnswer(sessionId, {
      position: served.body.position,
      questionVersionId: served.body.question.id,
      response,
    });

    results.push(answered.body);
    if (answered.body.sessionFinished) break;
  }

  return results;
}
