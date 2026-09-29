'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANSWER_GRACE_MS,
  type NextQuestionResponse,
  type SubmitAnswerResponse,
} from '@learnarena/core';
import type { ApiError } from '@/components/ui-app/StateBoundary';
import { apiFetch } from './useApi';

/**
 * Drives one solo quiz (PLANNING.md §20 screen 5).
 *
 * ADR-021 keeps every fetch in a hook; the components below it only render.
 *
 * The client never decides an outcome (Invariant 1). When the countdown hits
 * zero it calls `/next`, and the **server** resolves the lapsed question as a
 * TIMEOUT and serves the following one.
 */

export type QuizPhase = 'loading' | 'question' | 'feedback' | 'finished' | 'error';

export interface QuizState {
  phase: QuizPhase;
  question: NextQuestionResponse | null;
  feedback: SubmitAnswerResponse | null;
  /** True when the last question ended because time ran out. */
  timedOut: boolean;
  combo: number;
  remainingMs: number;
  error: ApiError | null;
  submitting: boolean;
}

export function useQuizSession(sessionId: string) {
  const [state, setState] = useState<QuizState>({
    phase: 'loading',
    question: null,
    feedback: null,
    timedOut: false,
    combo: 0,
    remainingMs: 0,
    error: null,
    submitting: false,
  });

  // Guards against two /next calls racing when the timer fires as the learner
  // clicks Continue.
  const advancing = useRef(false);

  const loadNext = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;

    setState((previous) => ({ ...previous, phase: 'loading', error: null }));

    const result = await apiFetch<NextQuestionResponse>(`/api/sessions/${sessionId}/next`, {
      method: 'POST',
    });

    advancing.current = false;

    if (result.ok) {
      setState((previous) => ({
        ...previous,
        phase: 'question',
        question: result.data,
        feedback: null,
        timedOut: false,
        remainingMs: Math.max(0, new Date(result.data.deadlineAt).getTime() - Date.now()),
      }));
      return;
    }

    // The server reports a finished session with INVALID_SESSION_STATE and
    // `details.sessionFinished` (ADR-040).
    const finished = result.error.details?.sessionFinished === true;
    setState((previous) => ({
      ...previous,
      phase: finished ? 'finished' : 'error',
      error: finished ? null : result.error,
    }));
  }, [sessionId]);

  const submit = useCallback(
    async (response: { optionId: string } | { value: string }) => {
      const question = state.question;
      if (!question) return;

      setState((previous) => ({ ...previous, submitting: true, error: null }));

      const result = await apiFetch<SubmitAnswerResponse>(`/api/sessions/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({
          position: question.position,
          questionVersionId: question.question.id,
          response,
          clientSentAt: new Date().toISOString(),
        }),
      });

      if (result.ok) {
        setState((previous) => ({
          ...previous,
          phase: 'feedback',
          feedback: result.data,
          combo: result.data.comboAfter,
          submitting: false,
        }));
        return;
      }

      // The answer landed after the grace window; the server has already
      // resolved the question as a timeout, so move on rather than retrying.
      if (result.error.code === 'QUESTION_EXPIRED') {
        setState((previous) => ({ ...previous, submitting: false, combo: 0 }));
        await loadNext();
        return;
      }

      setState((previous) => ({ ...previous, submitting: false, error: result.error }));
    },
    [loadNext, sessionId, state.question],
  );

  /** Called when the countdown reaches zero. */
  const handleExpiry = useCallback(async () => {
    setState((previous) => ({ ...previous, combo: 0 }));
    await loadNext();
  }, [loadNext]);

  // Start the quiz.
  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  // Countdown. Display only — the server decides what is late (§5.13).
  useEffect(() => {
    if (state.phase !== 'question' || !state.question) return;

    const deadline = new Date(state.question.deadlineAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setState((previous) => ({ ...previous, remainingMs: remaining }));

      // Wait out the grace window before giving up, so an answer already in
      // flight still counts (§8.2).
      if (remaining <= 0 && Date.now() > deadline + ANSWER_GRACE_MS) {
        void handleExpiry();
      }
    };

    const interval = setInterval(tick, 250);
    tick();
    return () => clearInterval(interval);
  }, [handleExpiry, state.phase, state.question]);

  return { state, submit, loadNext };
}
