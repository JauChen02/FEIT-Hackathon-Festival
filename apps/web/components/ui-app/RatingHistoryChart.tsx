'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { RatingHistory } from '@learnarena/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Per-category rating history (PLANNING.md §20 screen 7).
 *
 * Drawn from `skill_updates`, which §11.3 already keeps as the audit trail —
 * so the chart is the same data that explains every rating, not a separate
 * store.
 *
 * Presentational (ADR-021). Colours are theme tokens.
 */

export interface RatingHistoryChartProps {
  histories: readonly RatingHistory[];
}

export function RatingHistoryChart({ histories }: RatingHistoryChartProps) {
  const withData = histories.filter((history) => history.points.length > 1);

  if (withData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating history</CardTitle>
          <CardDescription>
            Finish a couple of quizzes and your progress will chart here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rating history</CardTitle>
        <CardDescription>Your most recent questions, oldest first.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {withData.map((history) => (
          <div key={history.categorySlug} data-testid={`history-${history.categorySlug}`}>
            <p className="mb-2 text-sm font-medium capitalize">{history.categorySlug}</p>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={history.points.map((point, index) => ({
                    index: index + 1,
                    proficiency: Math.round(point.proficiency),
                  }))}
                >
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="index"
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                    width={28}
                  />
                  <Line
                    type="monotone"
                    dataKey="proficiency"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
