'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HistoryItem, HistoryResponse } from '@learnarena/core';
import { HistoryList } from '@/components/ui-app/HistoryList';
import { StateBoundary, type ApiError } from '@/components/ui-app/StateBoundary';
import { apiFetch } from '@/hooks/useApi';

/**
 * Loads and pages the history list (ADR-021: fetching lives here, not in
 * `HistoryList`).
 */
export function HistoryClient() {
  const [sessions, setSessions] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (next?: string) => {
    const result = await apiFetch<HistoryResponse>(
      `/api/me/history${next ? `?cursor=${next}` : ''}`,
    );

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSessions((previous) =>
      next ? [...previous, ...result.data.sessions] : result.data.sessions,
    );
    setCursor(result.data.nextCursor);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  return (
    <StateBoundary
      loading={loading}
      error={error}
      isEmpty={sessions.length === 0}
      emptyMessage="You have not finished a quiz yet."
      onRetry={() => void load()}
    >
      <HistoryList
        sessions={sessions}
        hasMore={cursor !== null}
        loadingMore={loadingMore}
        onLoadMore={() => {
          if (!cursor) return;
          setLoadingMore(true);
          void load(cursor).finally(() => setLoadingMore(false));
        }}
      />
    </StateBoundary>
  );
}
