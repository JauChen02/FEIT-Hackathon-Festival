import type { SubmitAnswerResponse } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Instant per-question feedback (PLANNING.md §20 screen 5).
 *
 * This is the first moment the answer key may be shown — §8.1 allows it only
 * after grading, which has now happened server-side.
 *
 * Presentational (ADR-021).
 */

export interface AnswerFeedbackProps {
  feedback: SubmitAnswerResponse;
  /** True when the learner ran out of time rather than answering. */
  timedOut?: boolean;
  onContinue: () => void;
  continueLabel: string;
}

export function AnswerFeedback({
  feedback,
  timedOut = false,
  onContinue,
  continueLabel,
}: AnswerFeedbackProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="answer-feedback"
      data-correct={feedback.correct}
      className={cn(
        'flex flex-col gap-3 rounded-md border p-4',
        feedback.correct ? 'border-success' : 'border-destructive',
      )}
    >
      <p className={cn('font-medium', feedback.correct ? 'text-success' : 'text-destructive')}>
        {feedback.correct ? 'Correct' : timedOut ? 'Out of time' : 'Not quite'}
      </p>

      {!feedback.correct ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Answer: </span>
          <span data-testid="correct-answer">{feedback.correctAnswer}</span>
        </p>
      ) : null}

      <p data-testid="explanation" className="text-sm text-muted-foreground">
        {feedback.explanation}
      </p>

      {feedback.comboAfter > 1 ? (
        <p className="text-sm font-medium">{feedback.comboAfter} in a row</p>
      ) : null}

      <Button type="button" onClick={onContinue} data-testid="continue" className="self-start">
        {continueLabel}
      </Button>
    </div>
  );
}
