'use client';

import type { RecommendationResponse } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The "Focus today" card (PLANNING.md §20 screen 3).
 *
 * "Streak flame + display state, total & weekly points, **'Focus today' card
 *  with bonus badge**, category buttons."
 *
 * Presentational (ADR-021): the page fetches the recommendation and owns the
 * start action.
 */

export interface FocusCardProps {
  recommendation: RecommendationResponse;
  starting: boolean;
  onStart: () => void;
}

function reason(recommendation: RecommendationResponse): string {
  if (recommendation.neverPlayed) {
    return `You have not tried ${recommendation.categoryName} yet.`;
  }
  if (recommendation.proficiency < 50) {
    return `${recommendation.categoryName} is where you have the most room to grow.`;
  }
  return `It has been a while since you practised ${recommendation.categoryName}.`;
}

export function FocusCard({ recommendation, starting, onStart }: FocusCardProps) {
  return (
    <Card data-testid="focus-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">Focus today</CardTitle>
            <CardDescription>{reason(recommendation)}</CardDescription>
          </div>

          {recommendation.claimable ? (
            <span
              data-testid="focus-bonus"
              className="rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
            >
              ×{recommendation.bonusMultiplier}
            </span>
          ) : (
            <span data-testid="focus-done" className="text-xs text-muted-foreground">
              Done today
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex items-center justify-between gap-3">
        <span data-testid="focus-category" className="font-medium capitalize">
          {recommendation.categoryName}
        </span>

        <Button type="button" onClick={onStart} disabled={starting} data-testid="start-focus">
          {starting ? 'Starting…' : recommendation.claimable ? 'Start' : 'Play again'}
        </Button>
      </CardContent>
    </Card>
  );
}
