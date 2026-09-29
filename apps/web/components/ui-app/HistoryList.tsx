import Link from 'next/link';
import type { HistoryItem } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Past sessions (PLANNING.md §20 screen 8: "Past sessions → results page").
 *
 * Presentational (ADR-021).
 */

export interface HistoryListProps {
  sessions: readonly HistoryItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function HistoryList({ sessions, hasMore, loadingMore, onLoadMore }: HistoryListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
        <CardDescription>Every quiz you have finished.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2" data-testid="history-list">
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <Link
                href={`/results/${session.sessionId}`}
                data-testid={`history-item-${session.sessionId}`}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent"
              >
                <span className="flex flex-col">
                  <span className="font-medium capitalize">{session.categorySlug}</span>
                  <span className="text-xs text-muted-foreground">
                    {session.correctCount}/{session.questionCount} correct ·{' '}
                    {formatDate(session.endedAt)}
                  </span>
                </span>
                <span className="font-medium">{session.finalPoints.toLocaleString()} pts</span>
              </Link>
            </li>
          ))}
        </ul>

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="history-load-more"
            className="self-start"
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
