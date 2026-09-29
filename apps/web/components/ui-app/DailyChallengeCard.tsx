import type { DailyChallengeResponse } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function DailyChallengeCard({
  challenge,
  busy,
  onStart,
}: {
  challenge: NonNullable<DailyChallengeResponse['challenge']>;
  busy: boolean;
  onStart(): void;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">
          One day. One challenge.
        </p>
        <CardTitle>Daily challenge</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p>
          {challenge.questionCount} questions ·{' '}
          {challenge.bonusAvailable
            ? '+100 bonus points'
            : 'Daily bonus earned — replay for practice'}
        </p>
        <Button data-testid="start-daily-challenge" disabled={busy} onClick={onStart}>
          {busy ? 'Starting…' : 'Take the challenge'}
        </Button>
      </CardContent>
    </Card>
  );
}
