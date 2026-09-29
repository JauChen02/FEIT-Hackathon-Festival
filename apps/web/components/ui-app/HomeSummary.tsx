import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The Home header (PLANNING.md §20 screen 3).
 *
 * §20 describes the full screen as "Streak flame + display state, total &
 * weekly points, 'Focus today' card with bonus badge, category buttons". The
 * category buttons arrived in Phase 1 (see `CategoryPicker`); the streak needs
 * Phase 2 and the Focus card needs Phase 3, so those are shown as placeholders
 * rather than faked.
 *
 * Presentational (ADR-021): plain props, no fetching.
 */

export interface HomeSummaryProps {
  displayName: string;
  username: string;
  timezone: string;
  totalPoints: number;
}

export function HomeSummary({ displayName, username, timezone, totalPoints }: HomeSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="home-greeting">Welcome, {displayName}</CardTitle>
        <CardDescription>
          Signed in as {username} · {timezone}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Total points</dt>
            <dd data-testid="total-points" className="text-2xl font-semibold">
              {totalPoints.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Streak</dt>
            <dd className="text-2xl font-semibold">—</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
