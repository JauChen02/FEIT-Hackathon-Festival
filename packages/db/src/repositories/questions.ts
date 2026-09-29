/**
 * Question repository — the candidate pool for §11.6 selection.
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { QuestionCandidate, ServedQuestionPayload } from '@learnarena/core';
import type { Database } from '../client';
import { learningEvents, questionVersions } from '../schema/index';

/** Every LIVE version in a category, with its canonical rating (§11.6 step 2). */
export async function listLiveCandidates(
  db: Database,
  categoryId: string,
): Promise<QuestionCandidate[]> {
  const rows = await db
    .select({ questionVersionId: questionVersions.id, rating: questionVersions.rating })
    .from(questionVersions)
    .where(and(eq(questionVersions.categoryId, categoryId), eq(questionVersions.status, 'LIVE')))
    // Ordered so the pool handed to the pure selector is itself deterministic.
    .orderBy(questionVersions.rating, questionVersions.id);

  return rows.map((row) => ({
    questionVersionId: row.questionVersionId,
    rating: Number(row.rating),
  }));
}

/**
 * Version ids the user has answered since `since` (§11.6 step 3).
 *
 * Read from `learning_events` rather than `answers`: the two carry the same
 * rows one-for-one (§9 writes an event for every resolved question, including
 * timeouts), and `learning_events` already has the
 * `(user_id, category_id, occurred_at)` index this query needs.
 */
export async function listRecentlyAnsweredVersionIds(
  db: Database,
  userId: string,
  categoryId: string,
  since: Date,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ questionVersionId: learningEvents.questionVersionId })
    .from(learningEvents)
    .where(
      and(
        eq(learningEvents.userId, userId),
        eq(learningEvents.categoryId, categoryId),
        gte(learningEvents.occurredAt, since),
      ),
    );

  return rows.map((row) => row.questionVersionId).filter((id): id is string => id !== null);
}

/** Re-exported so callers can name the projection without reaching into core. */
export type ServedQuestion = ServedQuestionPayload;

export interface GradableQuestion extends ServedQuestionPayload {
  categoryId: string;
  subTopic: string | null;
  rating: string;
  /** The answer key. Server-side only — never reaches a response before grading. */
  answerJson: unknown;
  explanation: string;
}

/**
 * Load the full version rows for a set of ids, including the answer keys.
 *
 * Callers building a `/next` payload must project only {@link ServedQuestion}
 * fields; `toServedQuestion` below does that, and is the only way the route
 * constructs one (Invariant 1).
 */
export async function loadQuestionVersions(
  db: Database,
  ids: readonly string[],
): Promise<Map<string, GradableQuestion>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: questionVersions.id,
      type: questionVersions.type,
      prompt: questionVersions.prompt,
      optionsJson: questionVersions.optionsJson,
      answerJson: questionVersions.answerJson,
      explanation: questionVersions.explanation,
      categoryId: questionVersions.categoryId,
      subTopic: questionVersions.subTopic,
      rating: questionVersions.rating,
    })
    .from(questionVersions)
    .where(inArray(questionVersions.id, [...ids]));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        type: row.type,
        prompt: row.prompt,
        options: (row.optionsJson as { id: string; text: string }[] | null) ?? null,
        answerJson: row.answerJson,
        explanation: row.explanation,
        categoryId: row.categoryId,
        subTopic: row.subTopic,
        rating: row.rating,
      },
    ]),
  );
}

/**
 * Project a question down to what a learner may see before grading.
 *
 * §8.1: "Answer keys are never sent before the answer is graded." Routes build
 * their `/next` payload through this function and never by spreading the row,
 * so a new column cannot leak by accident.
 */
export function toServedQuestion(question: GradableQuestion): ServedQuestion {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: question.options
      ? question.options.map((option) => ({ id: option.id, text: option.text }))
      : null,
  };
}

/** Count of LIVE versions per category — used by the category picker. */
export async function countLiveByCategory(db: Database): Promise<Map<string, number>> {
  const rows = await db
    .select({
      categoryId: questionVersions.categoryId,
      liveCount: sql<number>`count(*)::int`,
    })
    .from(questionVersions)
    .where(eq(questionVersions.status, 'LIVE'))
    .groupBy(questionVersions.categoryId)
    .orderBy(desc(sql`count(*)`));

  return new Map(rows.map((row) => [row.categoryId, row.liveCount]));
}
