'use client';
import { useEffect, useState } from 'react';
import type { LeaderboardResponse } from '@learnarena/core';
import { apiFetch } from '@/hooks/useApi';
import { LeaderboardTable } from '@/components/ui-app/LeaderboardTable';
export default function LeaderboardPage() {
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState('current');
  const [scope, setScope] = useState('global');
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    let active = true;
    setBoard(null);
    setError(null);
    void apiFetch<LeaderboardResponse>(
      `/api/leaderboards?scope=${scope}&week=${encodeURIComponent(week)}`,
    ).then((result) => {
      if (active) {
        if (result.ok) setBoard(result.data);
        else setError(result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [week, scope]);
  useEffect(() => {
    if (!board) return;
    const tick = () => {
      const hours = Math.max(0, Math.ceil((Date.parse(board.nextWeekAt) - Date.now()) / 3600000));
      setRemaining(`${Math.floor(hours / 24)}d ${hours % 24}h`);
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [board]);
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <div>
        <p className="text-sm font-semibold tracking-widest text-primary uppercase">
          Better together
        </p>
        <h1 className="text-3xl font-bold">Weekly leaderboard</h1>
        <p className="mt-2 text-muted-foreground">
          Every practice counts. A fresh start every Monday, UTC.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          className="rounded-md border px-4 py-2"
          aria-pressed={scope === 'global'}
          onClick={() => setScope('global')}
        >
          Global
        </button>
        <button
          className="rounded-md border px-4 py-2"
          aria-pressed={scope === 'friends'}
          onClick={() => setScope('friends')}
        >
          Friends
        </button>
      </div>
      <label className="flex items-center gap-3">
        Week
        <input
          aria-label="Leaderboard week"
          type="week"
          className="rounded-md border bg-card p-2"
          onChange={(event) => setWeek(event.target.value || 'current')}
        />
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : board ? (
        <LeaderboardTable board={board} countdown={remaining} />
      ) : (
        <p role="status">Loading leaderboard…</p>
      )}
    </main>
  );
}
