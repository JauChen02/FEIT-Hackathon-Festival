/**
 * Session API response shapes (PLANNING.md §16.2).
 *
 * Shared by the route handlers and the client so the two cannot drift. These
 * are the *contract*; the database row types stay in `packages/db`.
 */

import type { PointsBreakdown } from '../scoring/types';
import type { SessionStatus } from '../transitions/session';

/**
 * A question as the learner may see it **before** grading.
 *
 * Deliberately narrow: no `answer_json`, no `explanation`. §8.1 — "Answer keys
 * are never sent before the answer is graded" (Invariant 1).
 */
export interface ServedQuestionPayload {
  id: string;
  type: 'MCQ' | 'NUMERIC';
  prompt: string;
  /** MCQ only. Carries no indication of which option is correct. */
  options: { id: string; text: string }[] | null;
}

/** `POST /api/sessions` */
export interface CreateSessionResponse {
  sessionId: string;
  status: 'CREATED';
  questionCount: number;
  timeLimitMs: number;
}

/** `POST /api/sessions/:id/next` */
export interface NextQuestionResponse {
  position: number;
  question: ServedQuestionPayload;
  deadlineAt: string;
  servedAt: string;
  timeLimitMs: number;
  questionCount: number;
  resolvedCount: number;
}

/** `POST /api/sessions/:id/answer` */
export interface SubmitAnswerResponse {
  correct: boolean;
  correctness: number;
  /** Revealed only now, after grading. */
  correctAnswer: string;
  explanation: string;
  speedFactor: number;
  comboAfter: number;
  sessionFinished: boolean;
}

/** One missed question on the results screen (§20 screen 6). */
export interface ReviewItem {
  position: number;
  questionVersionId: string;
  prompt: string;
  type: 'MCQ' | 'NUMERIC';
  /** What the learner sent, rendered for display. Null for a timeout. */
  yourAnswer: string | null;
  correctAnswer: string;
  explanation: string;
  timedOut: boolean;
  subTopic: string | null;
}

/** The frozen `result_json` payload, returned by `/complete` and `GET /:id`. */
export interface SessionResult {
  sessionId: string;
  categorySlug: string;
  finalPoints: number;
  pointsBreakdown: PointsBreakdown;
  accuracy: number;
  answeredCount: number;
  timedOutCount: number;
  correctCount: number;
  questionCount: number;
  isQualifying: boolean;
  localDate: string;
  /** Phase 2 fills this in (§12.1). */
  streak: null;
  /** Phase 3 fills this in (§11.5). */
  recommendationCompleted: boolean;
  review: ReviewItem[];
}

/** `GET /api/sessions/:id` */
export interface SessionStateResponse {
  session: {
    id: string;
    status: SessionStatus;
    categorySlug: string | null;
    questionCount: number;
    timeLimitMs: number;
    resolvedCount: number;
    createdAt: string;
    endedAt: string | null;
  };
  /** Present once COMPLETED. */
  result: SessionResult | null;
  /** Phase 3 populates this once `coach/process-session` has run (§18.3). */
  skillDeltas: null;
}

/** `GET /api/me/history` */
export interface HistoryItem {
  sessionId: string;
  categorySlug: string | null;
  finalPoints: number;
  accuracy: number;
  correctCount: number;
  questionCount: number;
  endedAt: string | null;
}

export interface HistoryResponse {
  sessions: HistoryItem[];
  /** Pass back as `?cursor=` for the next page; null when the list is done. */
  nextCursor: string | null;
}
