import type { StreakState } from '@learnarena/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
const labels = {
  ACTIVE_TODAY: 'Practiced today',
  AT_RISK: 'Practice today to keep your streak',
  PROTECTED: 'Your freezes can protect this streak',
  BROKEN: 'Start a new streak today',
};
export function StreakCard({ streak }: { streak: StreakState }) {
  return (
    <Card data-testid="streak-card">
      <CardHeader>
        <CardTitle>🔥 {streak.currentLen} day streak</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p data-testid="streak-state">{labels[streak.displayState]}</p>
        <p data-testid="freezes-held">❄ {streak.freezesAvailable} / 2 freezes available</p>
        <p className="text-sm text-muted-foreground">
          Longest streak: {streak.longestLen} days. Earn a freeze every 7 days.
        </p>
      </CardContent>
    </Card>
  );
}
