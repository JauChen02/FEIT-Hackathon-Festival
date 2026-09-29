'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/hooks/useApi';
import { CoachMessage } from '@/components/ui-app/CoachMessage';
type Achievement = { id: string; name: string; description: string; earnedAt: string | null };
export default function AchievementsPage() {
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void apiFetch<{ achievements: Achievement[] }>('/api/me/achievements').then((r) =>
      r.ok ? setItems(r.data.achievements) : setError(r.error.message),
    );
  }, []);
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <p className="text-sm tracking-widest text-primary uppercase">Progress to be proud of</p>
      <h1 className="text-3xl font-bold">Achievements</h1>
      <CoachMessage />
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p role="status">Loading achievements…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((a) => (
            <section key={a.id} className="space-y-3 rounded-xl border bg-card p-6">
              <span className="text-sm font-semibold text-primary">
                {a.earnedAt ? 'Earned' : 'In progress'}
              </span>
              <h2 className="text-xl font-semibold">{a.name}</h2>
              <p className="text-muted-foreground">{a.description}</p>
              {a.earnedAt && <p className="text-sm">{new Date(a.earnedAt).toLocaleDateString()}</p>}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
