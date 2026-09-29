import type { CategorySkill } from '@learnarena/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Per-category detail and the strengths/weaknesses lists (PLANNING.md §20
 * screen 7).
 *
 * Every number here is derived at read time (§11.4) — the only stored value is
 * the rating. Confidence is shown per category because the radar can only
 * carry one opacity (see `SkillRadar`).
 *
 * §11.1 / ADR-007: the Coach is category-level in MVP, so nothing here claims
 * sub-topic proficiency.
 *
 * Presentational (ADR-021).
 */

export interface SkillListProps {
  categories: readonly CategorySkill[];
  strengths: readonly string[];
  weaknesses: readonly string[];
}

const TIER_LABEL: Record<CategorySkill['tier'], string | null> = {
  RECOMMENDED: '×1.5 Focus',
  WEAK: '×1.25 Focus',
  NONE: null,
};

export function SkillList({ categories, strengths, weaknesses }: SkillListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your categories</CardTitle>
        <CardDescription>
          {strengths.length > 0 ? (
            <span data-testid="strengths">Strongest: {strengths.join(', ')}.</span>
          ) : (
            <span data-testid="strengths-empty">
              Play a few more sessions and your strengths will show up here.
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-col gap-2" data-testid="skill-list">
          {categories.map((category) => (
            <li
              key={category.categorySlug}
              data-testid={`skill-${category.categorySlug}`}
              className="flex flex-col gap-1 rounded-md border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{category.categoryName}</span>
                <span className="flex items-center gap-2">
                  {TIER_LABEL[category.tier] ? (
                    <span
                      data-testid={`skill-tier-${category.categorySlug}`}
                      className="rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {TIER_LABEL[category.tier]}
                    </span>
                  ) : null}
                  <span data-testid={`proficiency-${category.categorySlug}`}>
                    {Math.round(category.proficiency)}/100
                  </span>
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {category.neverPlayed
                  ? 'Not played yet'
                  : `${category.lifetimeEventCount} questions answered · confidence ${Math.round(
                      category.confidence * 100,
                    )}%`}
                {weaknesses.includes(category.categorySlug) ? ' · a weak area' : ''}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
