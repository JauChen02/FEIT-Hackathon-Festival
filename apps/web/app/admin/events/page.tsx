'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/hooks/useApi';
type EventWindow = {
  id: string;
  name: string;
  multiplier: string;
  startsAt: string;
  endsAt: string;
};
export default function EventsPage() {
  const [events, setEvents] = useState<EventWindow[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [multiplier, setMultiplier] = useState(1.5);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const result = await apiFetch<{ events: EventWindow[] }>('/api/admin/events');
    if (result.ok) setEvents(result.data.events);
    else setError(result.error.message);
  }
  useEffect(() => {
    void load();
  }, []);
  async function save() {
    setBusy(true);
    setError('');
    const result = await apiFetch('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        name,
        multiplier,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      }),
    });
    if (result.ok) {
      setName('');
      await load();
    } else setError(result.error.message);
    setBusy(false);
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <Link href="/admin/content" className="text-primary underline">
        Content studio
      </Link>
      <h1 className="text-3xl font-bold">Practice events</h1>
      <p className="text-muted-foreground">
        Multipliers apply at completion time. Windows cannot overlap, and awarded points retain the
        event details.
      </p>
      {error && <p role="alert">{error}</p>}
      {events === null ? (
        <p role="status">Loading events…</p>
      ) : (
        <>
          <form
            className="space-y-4 rounded-xl border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block">
              Event name
              <input
                required
                minLength={3}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ml-3 rounded border bg-background p-2"
              />
            </label>
            <label className="block">
              Multiplier
              <input
                type="number"
                min={1}
                max={2}
                step={0.01}
                required
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
                className="ml-3 w-24 rounded border bg-background p-2"
              />
            </label>
            <label className="block">
              Start (your browser timezone)
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="ml-3 rounded border bg-background p-2"
              />
            </label>
            <label className="block">
              End
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="ml-3 rounded border bg-background p-2"
              />
            </label>
            <button
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Create event
            </button>
          </form>
          {events.map((event) => (
            <article key={event.id} className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                {event.name} · ×{event.multiplier}
              </h2>
              <p>
                {new Date(event.startsAt).toLocaleString()} –{' '}
                {new Date(event.endsAt).toLocaleString()}
              </p>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
