'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import { apiFetch } from '@/hooks/useApi';
type Snapshot = {
  mode: string;
  round: number;
  totalRounds: number;
  roundId: string;
  deadlineAt: number;
  answered: boolean;
  hp: { A: number; B: number };
  players: { userId: string; displayName: string; team: string; connected: boolean }[];
  question: {
    id: string;
    prompt: string;
    type: string;
    options: { id: string; text: string }[] | null;
  } | null;
};
type Lobby = {
  status: string;
  gameType: string;
  members: { userId: string; displayName: string; ready: boolean }[];
  countdownAt: number | null;
};
type Result = {
  outcome: string;
  eligible?: boolean;
  finalPoints: number;
  pointsBreakdown?: { multipliers: { streak: number; friend: number; event: number } };
  review: { prompt: string; correctAnswer: string; explanation: string }[];
};
export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const socket = useRef<Socket | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [match, setMatch] = useState<Snapshot | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState('');
  const [response, setResponse] = useState('');
  const [sent, setSent] = useState(false);
  const [feedback, setFeedback] = useState<{ correctAnswer: string; explanation: string } | null>(
    null,
  );
  const [reviewed, setReviewed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let disposed = false;
    let client: Socket | undefined;
    async function connect() {
      const view = await apiFetch<{ result: Result | null }>(`/api/lobbies/${code}`);
      if (view.ok && view.data.result) {
        setResult(view.data.result);
        return;
      }
      const auth = await apiFetch<{ token: string; url: string; userId: string }>(
        '/api/realtime/token',
        { method: 'POST', body: JSON.stringify({ code }) },
      );
      if (disposed) return;
      if (!auth.ok) {
        setError(auth.error.message);
        return;
      }
      setMyId(auth.data.userId);
      const storageKey = `reconnect:${code}`;
      client = io(auth.data.url, {
        auth: { token: sessionStorage.getItem(storageKey) ?? auth.data.token },
        transports: ['websocket'],
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
      });
      socket.current = client;
      client.on('connect', () => {
        setConnected(true);
        setError('');
      });
      client.on('disconnect', () => {
        setConnected(false);
        setError('Connection lost. Reconnecting for up to 30 seconds…');
      });
      client.on('connect_error', () =>
        setError('Unable to connect to this room. Your reconnect window may have ended.'),
      );
      client.on('lobby_state', (state: Lobby) => setLobby(state));
      client.on('match_start', (state: Snapshot & { reconnectToken: string }) => {
        sessionStorage.setItem(storageKey, state.reconnectToken);
        if (client) client.auth = { token: state.reconnectToken };
        setMatch(state);
        setSent(state.answered);
      });
      client.on('state_snapshot', (state: Snapshot) => {
        setMatch(state);
        setSent(state.answered);
        setResponse('');
      });
      client.on('round_result', (round: { correctAnswer: string; explanation: string }) =>
        setFeedback(round),
      );
      client.on('answer_ack', (ack: { accepted: boolean; reason?: string }) => {
        if (!ack.accepted) {
          setError(
            ack.reason === 'ALREADY_ANSWERED'
              ? 'Your answer is already recorded.'
              : `Action not accepted: ${ack.reason ?? 'please retry'}`,
          );
          setSent(false);
        }
      });
      client.on('match_end', (value: Result) => {
        setResult(value);
        setError('');
        sessionStorage.removeItem(storageKey);
      });
    }
    void connect();
    return () => {
      disposed = true;
      client?.removeAllListeners();
      client?.disconnect();
      socket.current = null;
    };
  }, [code]);
  useEffect(() => {
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(((match?.deadlineAt ?? lobby?.countdownAt ?? Date.now()) - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [match?.deadlineAt, lobby?.countdownAt]);
  function submit() {
    if (!match?.question) return;
    setSent(true);
    setError('');
    const answer = match.question.type === 'MCQ' ? { optionId: response } : { value: response };
    socket.current?.emit(match.mode === 'quiz_coop' ? 'vote' : 'submit_answer', {
      clientEventId: crypto.randomUUID(),
      ...(match.mode === 'quiz_coop'
        ? { questionId: match.question.id }
        : { roundId: match.roundId }),
      response: answer,
    });
  }
  return (
    <main className="mx-auto max-w-(--container-content) space-y-6 p-(--spacing-gutter)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-widest text-primary uppercase">Your room</p>
          <h1 className="text-3xl font-bold tracking-widest">{code}</h1>
        </div>
        <span role="status" className="text-sm text-muted-foreground">
          {connected ? 'Connected' : 'Connecting…'}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {result ? (
        <section className="space-y-5 rounded-xl border bg-card p-6">
          <h2 className="text-2xl font-bold">
            {result.outcome === 'ABORTED'
              ? 'Match interrupted'
              : result.outcome === 'COMPLETED'
                ? 'Practice complete'
                : result.outcome === 'WIN'
                  ? 'Your team won'
                  : result.outcome === 'DRAW'
                    ? 'A well-matched draw'
                    : 'Keep learning, together'}
          </h2>
          <p className="text-3xl font-bold text-primary">+{result.finalPoints} points</p>
          {result.eligible === false && <p>Answer at least half the rounds to earn rewards.</p>}
          {result.pointsBreakdown && (
            <p>
              Streak ×{result.pointsBreakdown.multipliers.streak.toFixed(2)} · Friends ×
              {result.pointsBreakdown.multipliers.friend.toFixed(2)}
            </p>
          )}
          <h3 className="text-xl font-semibold">Team review</h3>
          {!result.review.length && <p>No missed questions to review.</p>}
          {result.review.map((item, i) => (
            <article key={i} className="space-y-2 rounded-lg border p-4">
              <h4 className="font-semibold">{item.prompt}</h4>
              <p>{item.correctAnswer}</p>
              <p className="text-muted-foreground">{item.explanation}</p>
            </article>
          ))}
          {result.review.length > 0 && (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I have reviewed the missed questions.
            </label>
          )}
          {(!result.review.length || reviewed) && (
            <Link
              className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
              href="/lobbies"
            >
              Back to the arena
            </Link>
          )}
        </section>
      ) : match ? (
        <>
          <div className="flex justify-between">
            <span>
              Round {match.round} / {match.totalRounds}
            </span>
            <span role="timer">{seconds}s</span>
          </div>
          {match.mode === 'team_deathmatch' && (
            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B'] as const).map((team) => (
                <div key={team}>
                  <label htmlFor={`hp-${team}`}>
                    Team {team}: {Math.max(0, match.hp[team])} HP
                  </label>
                  <progress
                    id={`hp-${team}`}
                    className="w-full accent-primary"
                    max={100}
                    value={Math.max(0, match.hp[team])}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {match.players
              .map((p) => `${p.displayName} (Team ${p.team})${p.connected ? '' : ' · offline'}`)
              .join(' · ')}
          </p>
          {match.question ? (
            <form
              className="space-y-5 rounded-xl border bg-card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <h2 data-testid="match-question" className="text-2xl font-semibold">
                {match.question.prompt}
              </h2>
              {match.question.type === 'MCQ' ? (
                <fieldset disabled={sent || !connected} className="grid gap-3">
                  {match.question.options?.map((option) => (
                    <label key={option.id} className="flex gap-3 rounded-lg border p-4">
                      <input
                        type="radio"
                        required
                        name="answer"
                        value={option.id}
                        checked={response === option.id}
                        onChange={() => setResponse(option.id)}
                      />
                      {option.text}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <label>
                  Answer
                  <input
                    required
                    disabled={sent || !connected}
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    className="ml-3 rounded-md border bg-background p-3"
                  />
                </label>
              )}
              <button
                disabled={sent || !connected || !response}
                className="rounded-md bg-primary px-5 py-3 text-primary-foreground"
              >
                {sent
                  ? 'Answer recorded — waiting for the team'
                  : match.mode === 'quiz_coop'
                    ? 'Submit vote'
                    : 'Submit answer'}
              </button>
            </form>
          ) : (
            <p role="status">Saving your match…</p>
          )}
          {feedback && (
            <aside className="space-y-2 rounded-xl border bg-card p-5">
              <h3 className="font-semibold">Previous round: {feedback.correctAnswer}</h3>
              <p>{feedback.explanation}</p>
            </aside>
          )}
        </>
      ) : lobby ? (
        <section className="space-y-5 rounded-xl border bg-card p-6">
          <h2 className="text-xl font-semibold">
            {lobby.gameType === 'quiz_coop' ? 'Co-op consensus' : 'Team deathmatch'}
          </h2>
          <p>
            Share this room code with your friends.{' '}
            {lobby.gameType === 'quiz_coop' ? '2–6 players' : '4–10 players, with an even number'}{' '}
            needed.
          </p>
          <ul className="space-y-3">
            {lobby.members.map((member) => (
              <li key={member.userId} className="flex justify-between rounded-md border p-3">
                <span>
                  {member.displayName}
                  {member.userId === myId ? ' (you)' : ''}
                </span>
                <span>{member.ready ? 'Ready' : 'Getting ready'}</span>
              </li>
            ))}
          </ul>
          {lobby.status === 'STARTING' && <p role="status">Starting in {seconds} seconds…</p>}
          {['OPEN', 'STARTING'].includes(lobby.status) ? (
            <button
              disabled={!connected}
              onClick={() =>
                socket.current?.emit('ready', {
                  clientEventId: crypto.randomUUID(),
                  isReady: !lobby.members.find((m) => m.userId === myId)?.ready,
                })
              }
              className="rounded-md bg-primary px-5 py-3 text-primary-foreground"
            >
              {lobby.members.find((m) => m.userId === myId)?.ready ? 'Not ready' : 'Ready to play'}
            </button>
          ) : (
            <p>This room is {lobby.status.toLowerCase()}.</p>
          )}
        </section>
      ) : (
        <p role="status">Loading room…</p>
      )}
      {!result && (
        <button
          className="rounded-md border px-4 py-2"
          onClick={() => {
            socket.current?.emit('leave', { clientEventId: crypto.randomUUID() });
            window.location.assign('/lobbies');
          }}
        >
          Leave room
        </button>
      )}
    </main>
  );
}
