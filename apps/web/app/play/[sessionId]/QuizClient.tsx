'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AnswerFeedback } from '@/components/ui-app/AnswerFeedback';
import { QuizProgress } from '@/components/ui-app/QuizProgress';
import { QuizQuestion } from '@/components/ui-app/QuizQuestion';
import { StateBoundary, type ApiError } from '@/components/ui-app/StateBoundary';
import { apiFetch } from '@/hooks/useApi';
import { useQuizSession } from '@/hooks/useQuizSession';

/**
 * The quiz loop (PLANNING.md §20 screen 5).
 *
 * Owns the calls; `QuizQuestion`, `QuizProgress` and `AnswerFeedback` are
 * presentational (ADR-021). Loading, empty and error states are all handled.
 */
export function QuizClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { state, submit, loadNext } = useQuizSession(sessionId);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<ApiError | null>(null);

  async function finish() {
    setFinishing(true);
    setFinishError(null);

    const result = await apiFetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' });

    if (result.ok) {
      router.replace(`/results/${sessionId}`);
      router.refresh();
      return;
    }
    setFinishing(false);
    setFinishError(result.error);
  }

  async function abandon() {
    await apiFetch(`/api/sessions/${sessionId}/abandon`, { method: 'POST' });
    router.replace('/home');
    router.refresh();
  }

  if (state.phase === 'finished') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <p>All ten questions answered.</p>
          {finishError ? (
            <StateBoundary loading={false} error={finishError} onRetry={finish}>
              {null}
            </StateBoundary>
          ) : null}
          <Button
            type="button"
            onClick={finish}
            disabled={finishing}
            data-testid="finish-quiz"
            className="self-start"
          >
            {finishing ? 'Finishing…' : 'See results'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <StateBoundary
      loading={state.phase === 'loading'}
      error={state.error}
      onRetry={() => void loadNext()}
    >
      {state.question ? (
        <div className="flex flex-col gap-6">
          <QuizProgress
            position={state.question.position}
            questionCount={state.question.questionCount}
            combo={state.combo}
            remainingMs={state.remainingMs}
            timeLimitMs={state.question.timeLimitMs}
          />

          <Card>
            <CardContent className="p-6">
              {state.phase === 'feedback' && state.feedback ? (
                <AnswerFeedback
                  feedback={state.feedback}
                  timedOut={state.timedOut}
                  continueLabel={state.feedback.sessionFinished ? 'See results' : 'Next question'}
                  onContinue={() => {
                    if (state.feedback?.sessionFinished) {
                      void finish();
                    } else {
                      void loadNext();
                    }
                  }}
                />
              ) : (
                <QuizQuestion
                  question={state.question.question}
                  disabled={state.submitting}
                  onSubmit={(response) => void submit(response)}
                />
              )}
            </CardContent>
          </Card>

          <Button
            type="button"
            variant="ghost"
            onClick={() => void abandon()}
            data-testid="abandon-quiz"
            className="self-start text-muted-foreground"
          >
            Abandon quiz
          </Button>
        </div>
      ) : null}
    </StateBoundary>
  );
}
