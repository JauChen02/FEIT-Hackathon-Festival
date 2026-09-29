'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const { error: authError } = await createSupabaseBrowserClient().auth.signOut({
        scope: 'local',
      });
      if (authError) throw authError;
      try {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('reconnect:')) sessionStorage.removeItem(key);
        }
      } catch {
        /* Storage may be disabled by the browser. */
      }
      // A full navigation clears cached authenticated pages and closes live sockets.
      window.location.replace('/sign-in');
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void signOut()}>
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          Could not sign out. Please try again.
        </p>
      )}
    </div>
  );
}
