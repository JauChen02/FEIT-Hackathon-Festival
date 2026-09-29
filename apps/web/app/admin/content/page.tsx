'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
interface Version {
  id: string;
  questionId: string;
  externalId: string;
  versionNumber: number;
  status: string;
  prompt: string;
  type: string;
  categoryId: string;
  categorySlug: string;
  optionsJson: unknown;
  answerJson: unknown;
  explanation: string;
  difficulty: number;
  origin: string;
  source: string;
  license: string;
}
interface Content {
  roles: string[];
  versions: Version[];
  audit: {
    id: string;
    entityId: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
  }[];
}
const blank = {
  externalId: '',
  categorySlug: 'math',
  type: 'NUMERIC',
  prompt: '',
  answer: { value: '0' },
  explanation: '',
  difficulty: 1,
  origin: 'HUMAN',
  source: '',
  license: '',
};
export default function AdminContentPage() {
  const [data, setData] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(blank, null, 2));
  const [selected, setSelected] = useState<Version | null>(null);
  const [category, setCategory] = useState('math');
  const load = useCallback(async () => {
    const r = await apiFetch<Content>('/api/admin/content');
    if (r.ok) setData(r.data);
    else
      setError(
        r.error.code === 'FORBIDDEN'
          ? 'Your account does not have a content role.'
          : r.error.message,
      );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(body: unknown) {
    setBusy(true);
    setError(null);
    const r = await apiFetch('/api/admin/content', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      setSelected(null);
      await load();
    } else setError(r.error.message);
  }
  function edit(version: Version) {
    setSelected(version);
    setCategory(version.categorySlug);
    setDraft(
      JSON.stringify(
        {
          externalId: version.externalId,
          categorySlug: version.categorySlug,
          type: version.type,
          prompt: version.prompt,
          ...(version.type === 'MCQ' ? { options: version.optionsJson } : {}),
          answer: version.answerJson,
          explanation: version.explanation,
          difficulty: version.difficulty,
          origin: version.origin === 'DEV_SEED' ? 'AI_GENERATED' : version.origin,
          source: version.source ?? '',
          license: version.license ?? '',
        },
        null,
        2,
      ),
    );
  }
  function save() {
    try {
      void action({
        action: 'save',
        ...(selected ? { versionId: selected.id } : {}),
        draft: JSON.parse(draft),
      });
    } catch {
      setError('Enter valid JSON for the draft.');
    }
  }
  const previous = selected
    ? data?.versions
        .filter(
          (v) => v.questionId === selected.questionId && v.versionNumber < selected.versionNumber,
        )
        .sort((a, b) => b.versionNumber - a.versionNumber)[0]
    : undefined;
  return (
    <main className="mx-auto max-w-(--container-shell) space-y-6 p-(--spacing-gutter)">
      <h1 className="text-3xl font-bold">Content studio</h1>
      <div className="flex gap-4">
        <Link href="/admin/events" className="text-primary underline">
          Practice events
        </Link>
        <Link href="/admin/activities" className="text-primary underline">
          Activities
        </Link>
        <Link href="/admin/challenges" className="text-primary underline">
          Daily challenges
        </Link>
      </div>
      <p className="text-muted-foreground">
        Draft, review, and publish. Every change has a history.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {!data && !error ? <p role="status">Loading publishing workspace…</p> : null}
      {data ? (
        <>
          <p>Your roles: {data.roles.join(', ')}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {selected ? `Edit version ${selected.versionNumber}` : 'New question draft'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block">
                  Category for editor
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="ml-3 rounded border bg-background p-2"
                  >
                    <option>math</option>
                    <option>logic</option>
                    <option>science</option>
                  </select>
                </label>
                <label htmlFor="draft-json">Question JSON</label>
                <textarea
                  id="draft-json"
                  className="min-h-96 w-full rounded-md border bg-background p-3 font-mono text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex gap-3">
                  <Button disabled={busy} onClick={save}>
                    Save draft
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(null);
                      setDraft(JSON.stringify(blank, null, 2));
                    }}
                  >
                    New draft
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Previously reviewed content needs a new version before editing. Approval requires
                  a different reviewer.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Version comparison</CardTitle>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="font-semibold">Previous version</h3>
                      <pre className="text-xs break-words whitespace-pre-wrap">
                        {previous
                          ? JSON.stringify(
                              {
                                prompt: previous.prompt,
                                answer: previous.answerJson,
                                explanation: previous.explanation,
                              },
                              null,
                              2,
                            )
                          : 'No previous version.'}
                      </pre>
                    </div>
                    <div>
                      <h3 className="font-semibold">Selected version</h3>
                      <pre className="text-xs break-words whitespace-pre-wrap">
                        {JSON.stringify(
                          {
                            prompt: selected.prompt,
                            answer: selected.answerJson,
                            explanation: selected.explanation,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p>Select a version to compare its question, answer, and explanation.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Review queue and versions</h2>
            {data.versions.map((version) => (
              <Card key={version.id}>
                <CardContent className="space-y-3 p-4">
                  <p>
                    <strong>{version.externalId}</strong> · v{version.versionNumber} ·{' '}
                    {version.status} · {version.origin}
                  </p>
                  <p>{version.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => edit(version)}>
                      Inspect / edit
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void action({ action: 'fork', versionId: version.id })}
                    >
                      New version
                    </Button>
                    {(version.status === 'DRAFT'
                      ? ['IN_REVIEW']
                      : version.status === 'IN_REVIEW'
                        ? ['APPROVED', 'DRAFT']
                        : version.status === 'APPROVED'
                          ? ['LIVE', 'DRAFT']
                          : version.status === 'LIVE'
                            ? ['ARCHIVED']
                            : []
                    ).map((to) => (
                      <Button
                        key={to}
                        disabled={busy}
                        onClick={() =>
                          void action({ action: 'transition', versionId: version.id, to })
                        }
                      >
                        {to === 'IN_REVIEW'
                          ? 'Submit for review'
                          : to === 'APPROVED'
                            ? 'Approve'
                            : to === 'DRAFT'
                              ? 'Request changes'
                              : to === 'LIVE'
                                ? 'Publish'
                                : 'Archive'}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          <details className="rounded-lg border bg-card p-4">
            <summary>Audit history</summary>
            <ul className="space-y-2 pt-4 text-sm">
              {data.audit.map((event) => (
                <li key={event.id}>
                  {event.entityId} · {event.fromStatus ?? 'New'} → {event.toStatus} {event.note}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </main>
  );
}
