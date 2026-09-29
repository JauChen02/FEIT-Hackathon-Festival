'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/hooks/useApi';
type Version = {
  id: string;
  slug: string;
  name: string;
  versionNumber: number;
  kind: string;
  status: string;
  origin: string;
  source: string;
  license: string;
  contentJson: unknown;
};
const blank = {
  slug: 'new-activity',
  name: 'New activity',
  kind: 'memory_match',
  origin: 'HUMAN',
  source: 'Original authored content',
  license: 'All rights reserved',
  content: { difficulty: 1, rounds: 5 },
};
export default function ActivitiesEditor() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [draft, setDraft] = useState(JSON.stringify(blank, null, 2));
  const [selected, setSelected] = useState<Version | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await apiFetch<{ versions: Version[] }>('/api/admin/activities');
    if (r.ok) setVersions(r.data.versions);
    else setError(r.error.message);
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(body: unknown) {
    setBusy(true);
    setError('');
    const r = await apiFetch('/api/admin/activities', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setSelected(null);
      await load();
    } else setError(r.error.message);
    setBusy(false);
  }
  function edit(v: Version, fork = false) {
    setSelected(fork ? null : v);
    setDraft(
      JSON.stringify(
        {
          slug: v.slug,
          name: v.name,
          kind: v.kind,
          origin: v.origin === 'DEV_SEED' ? 'AI_GENERATED' : v.origin,
          source: v.source,
          license: v.license,
          content: v.contentJson,
        },
        null,
        2,
      ),
    );
  }
  const previous = selected
    ? versions
        ?.filter((v) => v.slug === selected.slug && v.versionNumber < selected.versionNumber)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0]
    : null;
  return (
    <main className="mx-auto max-w-(--container-shell) space-y-6 p-(--spacing-gutter)">
      <Link href="/admin/content" className="text-primary underline">
        Content studio
      </Link>
      <h1 className="text-3xl font-bold">Activity publishing</h1>
      <p>
        Scenario graphs and mini-game generators follow the same independent review process as
        questions.
      </p>
      {error && <p role="alert">{error}</p>}
      {versions === null ? (
        <p role="status">Loading activities…</p>
      ) : (
        <>
          <form
            className="space-y-4 rounded-xl border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void action({
                  action: 'save',
                  ...(selected ? { versionId: selected.id } : {}),
                  draft: JSON.parse(draft),
                });
              } catch {
                setError('Enter valid JSON.');
              }
            }}
          >
            <label className="block" htmlFor="activity-json">
              {selected ? `Editing v${selected.versionNumber}` : 'New activity version'}
            </label>
            <textarea
              id="activity-json"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-80 w-full rounded-md border bg-background p-3 font-mono text-sm"
            />
            <button
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Save activity draft
            </button>
          </form>
          {selected && (
            <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
              <div>
                <h2 className="font-semibold">Previous content</h2>
                <pre className="text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(previous?.contentJson ?? 'No previous version', null, 2)}
                </pre>
              </div>
              <div>
                <h2 className="font-semibold">Selected content</h2>
                <pre className="text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(selected.contentJson, null, 2)}
                </pre>
              </div>
            </section>
          )}
          {versions.map((v) => (
            <article key={v.id} className="space-y-3 rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                {v.name} · v{v.versionNumber} · {v.status}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button className="rounded border px-3 py-2" onClick={() => edit(v)}>
                  Inspect / edit
                </button>
                <button className="rounded border px-3 py-2" onClick={() => edit(v, true)}>
                  New version
                </button>
                {(v.status === 'DRAFT'
                  ? ['IN_REVIEW']
                  : v.status === 'IN_REVIEW'
                    ? ['APPROVED', 'DRAFT']
                    : v.status === 'APPROVED'
                      ? ['LIVE', 'DRAFT']
                      : v.status === 'LIVE'
                        ? ['ARCHIVED']
                        : []
                ).map((to) => (
                  <button
                    key={to}
                    disabled={busy}
                    className="rounded border px-3 py-2"
                    onClick={() => void action({ action: 'transition', versionId: v.id, to })}
                  >
                    {to === 'IN_REVIEW'
                      ? 'Submit for review'
                      : to === 'APPROVED'
                        ? 'Approve'
                        : to === 'LIVE'
                          ? 'Publish'
                          : to === 'DRAFT'
                            ? 'Request changes'
                            : 'Archive'}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
