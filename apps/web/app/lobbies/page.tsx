'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/hooks/useApi';
export default function LobbiesPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(mode?: string) {
    setBusy(true);
    setError('');
    const result = await apiFetch<{ code: string }>(
      mode ? '/api/lobbies' : `/api/lobbies/${code.trim().toUpperCase()}/join`,
      { method: 'POST', body: JSON.stringify(mode ? { gameType: mode } : {}) },
    );
    if (result.ok) router.push(`/lobbies/${result.data.code}`);
    else {
      setError(result.error.message);
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <p className="text-sm tracking-widest text-primary uppercase">Learn together</p>
      <h1 className="text-3xl font-bold">Multiplayer arena</h1>
      <p className="text-muted-foreground">
        Invite friends with a room code. Everyone plays the same questions, with answers and timing
        checked by the server.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            mode: 'quiz_coop',
            name: 'Co-op consensus',
            description:
              '2–6 players · 10 questions · 20 seconds per question. Vote together and build a shared score.',
          },
          {
            mode: 'team_deathmatch',
            name: 'Team deathmatch',
            description:
              '4–10 players · Two equal teams · 100 HP. Correct answers deal damage; review missed questions together.',
          },
        ].map((game) => (
          <section key={game.mode} className="space-y-4 rounded-xl border bg-card p-6">
            <h2 className="text-xl font-semibold">{game.name}</h2>
            <p className="text-muted-foreground">{game.description}</p>
            <button
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
              onClick={() => void action(game.mode)}
            >
              Create {game.name} room
            </button>
          </section>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void action();
        }}
      >
        <label className="space-y-2">
          Room code
          <input
            required
            pattern="[A-HJ-NP-Za-hj-np-z2-9]{8}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="block rounded-md border bg-background p-2 uppercase"
          />
        </label>
        <button disabled={busy} className="rounded-md border px-4 py-2">
          Join room
        </button>
      </form>
    </main>
  );
}
