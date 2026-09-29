'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNotice, type ApiError } from './StateBoundary';

/**
 * Category picker (PLANNING.md §20 screen 4, and the category buttons on
 * screen 3).
 *
 * Shows the launch categories, their live question counts, and the ×1.25 /
 * ×1.5 focus tags from §20 screen 4.
 *
 * Presentational (ADR-021): the page owns the POST and passes state down.
 */

export interface CategoryOption {
  slug: string;
  name: string;
  liveQuestionCount: number;
  /**
   * The bonus a session here would carry right now (§11.8). §20 screen 4:
   * "weak ones show '×1.25 Focus' tag, recommended one '×1.5'".
   */
  tier?: 'NONE' | 'WEAK' | 'RECOMMENDED';
}

export interface CategoryPickerProps {
  categories: readonly CategoryOption[];
  /** The slug currently being started, so only that button shows a spinner. */
  startingSlug: string | null;
  error: ApiError | null;
  onStart: (slug: string) => void;
}

export function CategoryPicker({ categories, startingSlug, error, onStart }: CategoryPickerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a quiz</CardTitle>
        <CardDescription>Ten questions, 20 seconds each.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {error ? <ErrorNotice error={error} /> : null}

        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories are available to play yet.</p>
        ) : (
          categories.map((category) => (
            <Button
              key={category.slug}
              type="button"
              variant="outline"
              data-testid={`start-${category.slug}`}
              disabled={startingSlug !== null || category.liveQuestionCount < 10}
              className="h-auto justify-between py-3"
              onClick={() => onStart(category.slug)}
            >
              <span>{category.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {category.tier && category.tier !== 'NONE' ? (
                  <span
                    data-testid={`tier-${category.slug}`}
                    className="rounded-sm bg-secondary px-2 py-0.5 text-secondary-foreground"
                  >
                    {category.tier === 'RECOMMENDED' ? '×1.5 Focus' : '×1.25 Focus'}
                  </span>
                ) : null}
                {startingSlug === category.slug
                  ? 'Starting…'
                  : `${category.liveQuestionCount} questions`}
              </span>
            </Button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
