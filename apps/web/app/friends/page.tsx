'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/hooks/useApi';
type Person = { userId: string; username: string; displayName: string };
type Friendship = Person & { id: string; status: string; incoming: boolean };
type Friends = { friends: Friendship[]; blocked: Person[] };
export default function FriendsPage() {
  const [data, setData] = useState<Friends | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await apiFetch<Friends>('/api/friends');
    if (result.ok) setData(result.data);
    else setError(result.error.message);
  }, []);
  useEffect(() => {
    void load();
    const invite = new URLSearchParams(window.location.search).get('invite');
    if (invite) setCode(invite);
  }, [load]);
  async function act(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await apiFetch<{ code?: string }>(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (result.ok) {
      setNotice(
        result.data?.code
          ? `${window.location.origin}/friends?invite=${result.data.code}`
          : 'Updated.',
      );
      await load();
    } else setError(result.error.message);
    setBusy(false);
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <div>
        <p className="text-sm font-semibold tracking-widest text-primary uppercase">
          Better together
        </p>
        <h1 className="text-3xl font-bold">Friends</h1>
        <p className="mt-2 text-muted-foreground">
          Find a practice partner and celebrate progress together.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="rounded-lg border bg-card p-4 break-all">
          {notice}
        </p>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Add a friend</h2>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act('/api/friends/requests', { username });
          }}
        >
          <label>
            Username
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="ml-3 rounded-md border bg-background p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
          >
            Send request
          </button>
        </form>
        <button
          disabled={busy}
          className="rounded-md border px-4 py-2"
          onClick={() => void act('/api/invites', {})}
        >
          Create invite link
        </button>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act('/api/invites', {
              code: code.includes('invite=') ? code.split('invite=')[1] : code,
            });
          }}
        >
          <label>
            Invite code
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="ml-3 rounded-md border bg-background p-2"
            />
          </label>
          <button disabled={busy} className="rounded-md border px-4 py-2">
            Use invite
          </button>
        </form>
        <p className="text-sm text-muted-foreground">
          Invites expire after 7 days and can be used once. A request still needs to be accepted.
        </p>
      </section>
      {!data ? (
        <p role="status">Loading friends…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Your friends and requests</h2>
            {!data.friends.length && (
              <p className="text-muted-foreground">
                No friends yet. Send a request to get started.
              </p>
            )}
            {data.friends.map((person) => (
              <article
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4"
              >
                <div>
                  <h3 className="font-semibold">{person.displayName}</h3>
                  <p className="text-sm text-muted-foreground">
                    @{person.username} ·{' '}
                    {person.status === 'ACCEPTED'
                      ? 'Friends'
                      : person.incoming
                        ? 'Incoming request'
                        : 'Request sent'}
                  </p>
                </div>
                <div className="flex gap-3">
                  {person.status === 'PENDING' ? (
                    (person.incoming ? ['accept', 'decline'] : ['cancel']).map((action) => (
                      <button
                        key={action}
                        disabled={busy}
                        className="rounded-md border px-3 py-2 capitalize"
                        onClick={() => void act(`/api/friends/requests/${person.id}/${action}`)}
                      >
                        {action[0]!.toUpperCase() + action.slice(1)}
                      </button>
                    ))
                  ) : (
                    <button
                      disabled={busy}
                      className="rounded-md border px-3 py-2"
                      onClick={() => void act(`/api/friends/${person.userId}`, undefined, 'DELETE')}
                    >
                      Remove
                    </button>
                  )}
                  <button
                    disabled={busy}
                    className="rounded-md border px-3 py-2"
                    onClick={() => void act('/api/blocks', { userId: person.userId })}
                  >
                    Block
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Blocked users</h2>
            {!data.blocked.length && (
              <p className="text-muted-foreground">You have no blocked users.</p>
            )}
            {data.blocked.map((person) => (
              <div
                key={person.userId}
                className="flex justify-between rounded-lg border bg-card p-4"
              >
                <span>@{person.username}</span>
                <button
                  disabled={busy}
                  onClick={() => void act(`/api/blocks/${person.userId}`, undefined, 'DELETE')}
                >
                  Unblock
                </button>
              </div>
            ))}
          </section>
        </>
      )}
      <Link href="/feed" className="mr-5 text-primary underline">
        Friends’ milestones
      </Link>
      <Link href="/leaderboard" className="inline-block text-primary underline">
        View the friends leaderboard
      </Link>
    </main>
  );
}
