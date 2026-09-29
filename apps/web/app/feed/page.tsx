'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/hooks/useApi';
type FeedEvent = { id: string; displayName: string; message: string; createdAt: string };
export default function FeedPage() {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void apiFetch<{ events: FeedEvent[] }>('/api/feed').then((r) =>
      r.ok ? setEvents(r.data.events) : setError(r.error.message),
    );
  }, []);
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <h1 className="text-3xl font-bold">Friends’ milestones</h1>
      <p className="text-muted-foreground">
        A little encouragement from the people you learn with.
      </p>
      {error && <p role="alert">{error}</p>}
      {events === null ? (
        <p role="status">Loading milestones…</p>
      ) : events.length ? (
        events.map((event) => (
          <article key={event.id} className="space-y-2 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{event.displayName}</h2>
            <p>{event.message}</p>
            <time className="text-sm text-muted-foreground">
              {new Date(event.createdAt).toLocaleDateString()}
            </time>
          </article>
        ))
      ) : (
        <p>
          No milestones yet.{' '}
          <Link href="/friends" className="text-primary underline">
            Connect with a friend
          </Link>{' '}
          to celebrate progress together.
        </p>
      )}
    </main>
  );
}
