'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/hooks/useApi';
export function CoachMessage({ sessionId }: { sessionId?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let count = 0;
    const poll = async () => {
      const result = await apiFetch<{ message: { message: string } | null }>(
        `/api/me/coach/latest${sessionId ? `?sessionId=${sessionId}` : ''}`,
      );
      if (active && result.ok && result.data.message) setMessage(result.data.message.message);
      if (++count >= 12) clearInterval(timer);
    };
    const timer = setInterval(() => void poll(), 3000);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [sessionId]);
  return (
    <aside className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Your learning coach</h2>
      <p>
        {message ??
          'Every practice helps you see what to learn next. Take a moment to reflect on what felt easy and what felt new. Tip: Read a missed explanation, then explain it in your own words.'}
      </p>
    </aside>
  );
}
