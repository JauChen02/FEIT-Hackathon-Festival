'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/hooks/useApi';
export function BreakReminder() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!path.startsWith('/play/') && !/^\/lobbies\/[A-HJ-NP-Z2-9]+$/.test(path)) return;
    let enabled = true;
    void apiFetch<{ breakReminder: boolean }>('/api/me/preferences').then((r) => {
      if (r.ok) enabled = r.data.breakReminder;
    });
    let elapsed = 0;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') elapsed += 60000;
      if (enabled && elapsed >= 45 * 60000) {
        setShow(true);
        clearInterval(timer);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [path]);
  return show ? (
    <aside
      role="status"
      className="fixed right-4 bottom-4 z-50 max-w-sm space-y-3 rounded-xl border bg-card p-5 shadow-lg"
    >
      <p className="font-semibold">Nice work. Time for a break?</p>
      <p className="text-sm text-muted-foreground">
        You have been practising for a while. Finish this round, then give yourself a breather.
      </p>
      <button className="text-primary underline" onClick={() => setShow(false)}>
        Thanks, got it
      </button>
    </aside>
  ) : null;
}
