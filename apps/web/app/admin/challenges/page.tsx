'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/hooks/useApi';
type Version = { id: string; prompt: string; status: string; categorySlug: string };
export default function ChallengeEditor() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('math');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch<{ versions: Version[] }>('/api/admin/content').then((r) =>
      r.ok
        ? setVersions(r.data.versions.filter((v) => v.status === 'LIVE'))
        : setError(r.error.message),
    );
  }, []);
  async function publish() {
    setBusy(true);
    const r = await apiFetch('/api/admin/content', {
      method: 'POST',
      body: JSON.stringify({ action: 'daily', date, questionVersionIds: selected }),
    });
    if (r.ok) setNotice('Daily challenge published. Its question set is now fixed.');
    else setError(r.error.message);
    setBusy(false);
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <Link href="/admin/content" className="text-primary underline">
        Content studio
      </Link>
      <h1 className="text-3xl font-bold">Daily challenge</h1>
      <p>
        Select ten published questions from a category, in play order. Each date has one immutable
        set.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <label>
          Date
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ml-3 rounded border bg-background p-2"
          />
        </label>
        <label className="ml-4">
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSelected([]);
            }}
            className="ml-3 rounded border bg-background p-2"
          >
            {['math', 'logic', 'science'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <p>{selected.length}/10 selected</p>
        {versions === null ? (
          <p role="status">Loading questions…</p>
        ) : (
          versions
            .filter((v) => v.categorySlug === category)
            .map((v) => (
              <label key={v.id} className="flex gap-3 rounded-lg border bg-card p-4">
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  disabled={!selected.includes(v.id) && selected.length === 10}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, v.id] : selected.filter((id) => id !== v.id),
                    )
                  }
                />
                {selected.includes(v.id) ? `${selected.indexOf(v.id) + 1}. ` : ''}
                {v.prompt}
              </label>
            ))
        )}
        <button
          disabled={busy || selected.length !== 10}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Publish challenge
        </button>
      </form>
    </main>
  );
}
