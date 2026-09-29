import type { PointsBreakdown } from '@learnarena/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The points breakdown (PLANNING.md §20 screen 6, §10.4).
 *
 * "The breakdown JSON is shown to the user ('Base 800 · Combo +168.75 ·
 *  Streak ×1.10 · Focus ×1.50 = 1,598'); **it teaches which behaviors are
 *  rewarded**."
 *
 * That last clause is why every line is shown rather than just the total.
 * Multipliers fixed at 1.0 in Phase 1 are listed as "—" rather than hidden, so
 * the learner can see what is available to earn.
 *
 * Presentational (ADR-021).
 */

export interface PointsBreakdownCardProps {
  breakdown: PointsBreakdown;
  finalPoints: number;
}

/** Trim trailing zeros so "168.7500" reads as "168.75". */
function decimal(value: string): string {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? String(Number(asNumber.toFixed(4))) : value;
}

export function PointsBreakdownCard({ breakdown, finalPoints }: PointsBreakdownCardProps) {
  const multiplierRows = [
    { label: 'Streak', value: breakdown.multipliers.streak, hint: 'Play on consecutive days' },
    { label: 'Friends', value: breakdown.multipliers.friend, hint: 'Play with friends' },
    { label: 'Focus', value: breakdown.multipliers.weakness, hint: 'Work on a weak area' },
    { label: 'Event', value: breakdown.multipliers.event, hint: 'Special events' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span data-testid="final-points">{finalPoints.toLocaleString()}</span> points
        </CardTitle>
        <CardDescription>How this was worked out</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt>Base</dt>
            <dd data-testid="breakdown-base">{decimal(breakdown.rawBasePoints)}</dd>
          </div>

          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Combo
              <span className="ml-1 text-xs">(consecutive correct answers)</span>
            </dt>
            <dd data-testid="breakdown-combo">+{decimal(breakdown.comboContribution)}</dd>
          </div>

          {multiplierRows.map((row) => (
            <div key={row.label} className="flex justify-between">
              <dt className="text-muted-foreground">
                {row.label}
                {row.value === 1 ? <span className="ml-1 text-xs">({row.hint})</span> : null}
              </dt>
              <dd data-testid={`breakdown-${row.label.toLowerCase()}`}>
                {row.value === 1 ? '—' : `×${row.value}`}
              </dd>
            </div>
          ))}

          {breakdown.capApplied ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Capped at 4× base</dt>
              <dd data-testid="breakdown-capped">{decimal(breakdown.cap)}</dd>
            </div>
          ) : null}

          <div className="mt-2 flex justify-between border-t pt-2 font-medium">
            <dt>Total</dt>
            <dd>{finalPoints.toLocaleString()}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
