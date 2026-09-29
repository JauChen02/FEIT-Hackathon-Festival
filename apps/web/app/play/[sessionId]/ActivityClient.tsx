'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ModeAnswerResult, ModeQuestion } from '@learnarena/core';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function ActivityClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState<ModeQuestion | null>(null);
  const [feedback, setFeedback] = useState<ModeAnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const finish = useCallback(async () => {
    setBusy(true);
    const r = await apiFetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
    if (r.ok) router.push(`/results/${sessionId}`);
    else {
      setError(r.error.message);
      setBusy(false);
    }
  }, [router, sessionId]);
  const next = useCallback(async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    setValue('');
    const r = await apiFetch<ModeQuestion>(`/api/sessions/${sessionId}/next`, { method: 'POST' });
    setBusy(false);
    if (r.ok) {
      if (r.data.finished) {
        void finish();
        return;
      }
      setQuestion(r.data);
      setReveal(Boolean(r.data.sequence));
    } else if ((r.error.details as { sessionFinished?: boolean } | undefined)?.sessionFinished)
      void finish();
    else setError(r.error.message);
  }, [sessionId, finish]);
  useEffect(() => {
    void next();
  }, [next]);
  useEffect(() => {
    if (!question) return;
    const update = () => {
      if (question.revealUntil && Date.now() >= Date.parse(question.revealUntil)) setReveal(false);
      if (question.deadlineAt)
        setSeconds(Math.max(0, Math.ceil((Date.parse(question.deadlineAt) - Date.now()) / 1000)));
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [question]);
  async function answer(optionId?: string) {
    if (!question) return;
    setBusy(true);
    const r = await apiFetch<ModeAnswerResult>(`/api/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        position: question.position,
        questionVersionId: question.id,
        response: optionId ? { optionId } : { value },
      }),
    });
    setBusy(false);
    if (r.ok) setFeedback(r.data);
    else setError(r.error.message);
  }
  async function abandon() {
    setBusy(true);
    const r = await apiFetch(`/api/sessions/${sessionId}/abandon`, { method: 'POST' });
    if (r.ok) router.push('/games');
    else {
      setError(r.error.message);
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <p className="text-xs tracking-widest text-primary uppercase">
          {question?.kind.replaceAll('_', ' ') ?? 'Get ready'}
        </p>
        <CardTitle>{question?.prompt ?? 'Loading activity…'}</CardTitle>
        {seconds !== null ? <p role="timer">{seconds}s remaining</p> : null}
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <p role="alert">{error}</p> : null}
        {feedback ? (
          <div data-testid="activity-feedback">
            <p>
              {feedback.correctness === 1
                ? 'Well done!'
                : feedback.correctness > 0
                  ? 'Partly right — keep practicing.'
                  : 'A chance to learn.'}
            </p>
            <p className="my-3">{feedback.explanation}</p>
            <Button
              disabled={busy}
              onClick={() => void (feedback.sessionFinished ? finish() : next())}
            >
              {feedback.sessionFinished ? 'See results' : 'Next'}
            </Button>
          </div>
        ) : question ? (
          <>
            {reveal ? (
              <div>
                <p>Remember this sequence:</p>
                <p
                  data-testid="memory-sequence"
                  className="my-4 text-3xl font-bold tracking-widest"
                >
                  {question.sequence?.join(' ')}
                </p>
              </div>
            ) : question.options ? (
              <div className="grid gap-3">
                {question.options.map((option) => (
                  <Button
                    className="h-auto py-3 whitespace-normal"
                    variant="outline"
                    disabled={busy}
                    key={option.id}
                    onClick={() => void answer(option.id)}
                  >
                    {option.text}
                  </Button>
                ))}
              </div>
            ) : (
              <form
                className="flex gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void answer();
                }}
              >
                <input
                  aria-label="Your answer"
                  data-testid="activity-answer"
                  className="min-w-0 flex-1 rounded-md border bg-background p-3"
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  autoComplete="off"
                />
                <Button disabled={busy}>Check answer</Button>
              </form>
            )}
          </>
        ) : (
          <p role="status">Loading…</p>
        )}
        {seconds === 0 ? (
          <Button disabled={busy} onClick={() => void finish()}>
            Finish sprint
          </Button>
        ) : null}
        <Button variant="ghost" disabled={busy} onClick={() => void abandon()}>
          Abandon activity
        </Button>
      </CardContent>
    </Card>
  );
}
