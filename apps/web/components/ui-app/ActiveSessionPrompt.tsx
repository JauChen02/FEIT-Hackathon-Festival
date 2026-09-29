'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Resume-or-abandon prompt (PLANNING.md §8.1).
 *
 * "At most one open solo session per user. Starting another returns
 *  `409 ACTIVE_SESSION_EXISTS` with the open session id; **the client offers
 *  Resume or Abandon**."
 *
 * The status matters: §15.1 has no `CREATED → ABANDONED` edge, so a session
 * with nothing served is cancelled instead (ADR-041). The label follows.
 *
 * Presentational (ADR-021).
 */

export interface ActiveSessionPromptProps {
  sessionId: string;
  status: 'CREATED' | 'ACTIVE';
  busy: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

export function ActiveSessionPrompt({
  status,
  busy,
  onResume,
  onDiscard,
}: ActiveSessionPromptProps) {
  const started = status === 'ACTIVE';

  return (
    <Card data-testid="active-session-prompt">
      <CardHeader>
        <CardTitle className="text-base">You have a quiz in progress</CardTitle>
        <CardDescription>
          {started
            ? 'Pick up where you left off, or abandon it to start something new.'
            : 'You started a quiz but have not answered anything yet.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex gap-2">
        <Button type="button" onClick={onResume} disabled={busy} data-testid="resume-session">
          Resume
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          disabled={busy}
          data-testid="discard-session"
        >
          {started ? 'Abandon' : 'Cancel'}
        </Button>
      </CardContent>
    </Card>
  );
}
