import type { ReviewItem } from '@learnarena/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Missed-question review (PLANNING.md §20 screen 6).
 *
 * §24 Phase 1: "sees … a review of every missed question with its
 * explanation". This is the part of the results screen that does the teaching,
 * so the explanation is shown in full rather than behind a disclosure.
 *
 * Presentational (ADR-021).
 */

export interface MissedQuestionReviewProps {
  review: readonly ReviewItem[];
  questionCount: number;
  correctCount: number;
}

export function MissedQuestionReview({
  review,
  questionCount,
  correctCount,
}: MissedQuestionReviewProps) {
  if (review.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nothing missed</CardTitle>
          <CardDescription>You answered all {questionCount} questions correctly.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review</CardTitle>
        <CardDescription>
          You got {correctCount} of {questionCount} right. Here is what to look at.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ol className="flex flex-col gap-4" data-testid="review-list">
          {review.map((item) => (
            <li
              key={item.questionVersionId}
              data-testid={`review-item-${item.position}`}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <p className="text-sm font-medium">
                <span className="text-muted-foreground">Q{item.position + 1}. </span>
                {item.prompt}
              </p>

              <p className="text-sm">
                <span className="text-muted-foreground">Your answer: </span>
                {item.timedOut ? (
                  <span data-testid="review-timed-out">ran out of time</span>
                ) : (
                  <span>{item.yourAnswer}</span>
                )}
              </p>

              <p className="text-sm">
                <span className="text-muted-foreground">Correct answer: </span>
                <span data-testid="review-correct-answer">{item.correctAnswer}</span>
              </p>

              <p data-testid="review-explanation" className="text-sm text-muted-foreground">
                {item.explanation}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
