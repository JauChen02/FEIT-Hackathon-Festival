import { cn } from '@/lib/utils';

/**
 * Quiz progress and combo indicator (PLANNING.md §20 screen 5).
 *
 * Presentational (ADR-021): plain props, no fetching, no timer of its own —
 * the page owns the countdown and passes the remaining milliseconds down.
 */

export interface QuizProgressProps {
  /** 0-based, as stored in `session_questions.position`. */
  position: number;
  questionCount: number;
  /** Consecutive fully-correct answers so far, capped at 10 (§10.1). */
  combo: number;
  /** Milliseconds left on the server's deadline, as the client last saw it. */
  remainingMs: number;
  timeLimitMs: number;
}

export function QuizProgress({
  position,
  questionCount,
  combo,
  remainingMs,
  timeLimitMs,
}: QuizProgressProps) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.max(0, Math.min(1, remainingMs / timeLimitMs));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span data-testid="quiz-position">
          Question {position + 1} of {questionCount}
        </span>
        {combo > 0 ? (
          <span data-testid="quiz-combo" className="font-medium">
            {combo} in a row
          </span>
        ) : null}
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-sm bg-muted"
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin={0}
        aria-valuemax={Math.round(timeLimitMs / 1000)}
        aria-valuenow={seconds}
      >
        {/*
          The width is data, not design: it tracks the server deadline every
          tick, so it cannot be a Tailwind class. Both colours are theme tokens
          (ADR-021).
        */}
        <div
          className={cn('h-full', fraction > 0.25 ? 'bg-primary' : 'bg-destructive')}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <span data-testid="quiz-timer" className="text-xs text-muted-foreground">
        {seconds}s left
      </span>
    </div>
  );
}
