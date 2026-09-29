/**
 * Session request schemas (PLANNING.md §16.2).
 *
 * Shared by the route handlers and the client so both agree on the shapes.
 */

import { z } from 'zod';

/** §16.2: `{gameType:"quiz_solo", categorySlug}`. */
export const createSessionSchema = z.object({
  // Only `quiz_solo` is ENABLED in MVP; anything else is a client error rather
  // than a 404, because the value is not a resource identifier.
  gameType: z.literal('quiz_solo', { message: 'Only quiz_solo sessions can be created.' }),
  categorySlug: z.string().regex(/^[a-z]+$/, { message: 'categorySlug must be a lowercase slug.' }),
  /**
   * Links the session to today's recommendation, which is what earns the ×1.5
   * tier (§11.8). Ignored when it is not today's, not this learner's, already
   * spent, or for a different category.
   */
  recommendationId: z.uuid({ message: 'recommendationId must be a UUID.' }).optional(),
});

export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

/**
 * The learner's response to one question.
 *
 * MCQ sends the chosen option id; NUMERIC sends the raw text the learner
 * typed, un-normalised, so grading (not the client) decides what it means.
 */
export const mcqResponseSchema = z.object({ optionId: z.string().min(1).max(8) });
export const numericResponseSchema = z.object({ value: z.string().min(1).max(64) });

export const answerResponseSchema = z.union([mcqResponseSchema, numericResponseSchema]);

/** §16.2: `{position, questionVersionId, response, clientSentAt?}`. */
export const submitAnswerSchema = z.object({
  /** 0-based, matching `session_questions.position`. */
  position: z.number().int().min(0).max(63),
  questionVersionId: z.uuid({ message: 'questionVersionId must be a UUID.' }),
  response: answerResponseSchema,
  /**
   * Advisory only (§14.1, §17.3): stored in the diagnostic column and never
   * used for timing decisions.
   */
  clientSentAt: z.iso
    .datetime({ message: 'clientSentAt must be an ISO-8601 timestamp.' })
    .optional(),
});

export type SubmitAnswerRequest = z.infer<typeof submitAnswerSchema>;

/** §16.2: `GET /api/me/history?cursor=`. */
export const historyQuerySchema = z.object({
  cursor: z.uuid({ message: 'cursor must be a session id.' }).optional(),
});

/** `Idempotency-Key` header on session creation (§18.1). */
export const idempotencyKeySchema = z.uuid({
  message: 'Idempotency-Key must be a UUID.',
});
