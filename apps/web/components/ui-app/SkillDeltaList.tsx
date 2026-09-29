import type { SkillDelta } from '@learnarena/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Skill movement from one session (PLANNING.md §20 screen 6).
 *
 * §24 Phase 3: "Results shows skill deltas after post-processing (**with a
 * pending state before**)."
 *
 * `deltas === null` is that pending state: `coach/process-session` runs after
 * the completion transaction commits (§18.3), so the results screen is
 * reachable before the numbers exist.
 *
 * Presentational (ADR-021).
 */

export interface SkillDeltaListProps {
  deltas: SkillDelta[] | null;
}

export function SkillDeltaList({ deltas }: SkillDeltaListProps) {
  if (deltas === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill update</CardTitle>
          <CardDescription>
            <span role="status" aria-live="polite" data-testid="skill-deltas-pending">
              Working out what this changed…
            </span>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (deltas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skill update</CardTitle>
        <CardDescription>How this session moved your rating.</CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-col gap-2" data-testid="skill-deltas">
          {deltas.map((delta) => {
            const rose = delta.delta >= 0;
            return (
              <li
                key={delta.categorySlug}
                data-testid={`skill-delta-${delta.categorySlug}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span className="capitalize">{delta.categorySlug}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {Math.round(delta.proficiencyBefore)} → {Math.round(delta.proficiencyAfter)}
                  </span>
                  <span className={rose ? 'text-success' : 'text-destructive'}>
                    {rose ? '+' : ''}
                    {delta.delta.toFixed(1)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
