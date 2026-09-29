'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uuidv7 } from '@learnarena/core';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
type Activity = { id: string; name: string; slug: string; kind: string };
export default function GamesPage() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch<{ activities: Activity[] }>('/api/games').then((r) => {
      if (r.ok) setActivities(r.data.activities);
      else setError(r.error.message);
    });
  }, []);
  async function start(activity: Activity) {
    setBusy(true);
    setError(null);
    const categorySlug =
      activity.kind === 'memory_match'
        ? 'memory'
        : activity.slug === 'lab-safety'
          ? 'science'
          : activity.slug === 'logical-evidence'
            ? 'logic'
            : 'math';
    const r = await apiFetch<{ sessionId: string }>('/api/sessions', {
      method: 'POST',
      headers: { 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        gameType: activity.kind,
        activityVersionId: activity.id,
        categorySlug,
      }),
    });
    if (r.ok) router.push(`/play/${r.data.sessionId}`);
    else {
      setError(r.error.message);
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <div>
        <p className="text-sm tracking-widest text-primary uppercase">Find your flow</p>
        <h1 className="text-3xl font-bold">More ways to learn</h1>
        <p className="mt-2 text-muted-foreground">
          Quick thinking, better recall, and choices that matter.
        </p>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {activities === null ? (
        <p role="status">Loading activities…</p>
      ) : activities.length === 0 ? (
        <p>No activities are published yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {activities.map((activity) => (
            <Card key={activity.id}>
              <CardHeader>
                <p className="text-xs tracking-widest text-muted-foreground uppercase">
                  {activity.kind.replaceAll('_', ' ')}
                </p>
                <CardTitle>{activity.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  disabled={busy}
                  data-testid={`play-${activity.slug}`}
                  onClick={() => void start(activity)}
                >
                  Start activity →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
