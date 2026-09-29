'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/hooks/useApi';
type Preferences = {
  pushEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  dailyGoal: number;
  breakReminder: boolean;
};
export function PrivacySettings() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    void apiFetch<Preferences>('/api/me/preferences').then((r) =>
      r.ok ? setPreferences(r.data) : setError(r.error.message),
    );
  }, []);
  async function save() {
    if (!preferences) return;
    setBusy(true);
    const result = await apiFetch('/api/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        pushEnabled: preferences.pushEnabled,
        quietStart: preferences.quietStart,
        quietEnd: preferences.quietEnd,
        dailyGoal: preferences.dailyGoal,
        breakReminder: preferences.breakReminder,
      }),
    });
    if (result.ok) {
      setNotice('Preferences saved.');
      localStorage.setItem('learnarena-break-reminder', String(preferences.breakReminder));
    } else setError(result.error.message);
    setBusy(false);
  }
  async function enablePush() {
    setBusy(true);
    setError('');
    try {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      )
        throw new Error('This browser does not support push notifications.');
      const config = await apiFetch<{ publicKey: string | null }>('/api/push/subscribe');
      if (!config.ok || !config.data.publicKey)
        throw new Error('Notifications are not configured on this server yet.');
      if ((await Notification.requestPermission()) !== 'granted')
        throw new Error('Notifications remain off. You can change browser permissions later.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(config.data.publicKey.replaceAll('-', '+').replaceAll('_', '/')),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const raw = subscription.toJSON();
      const result = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys, consent: true }),
      });
      if (!result.ok) throw new Error(result.error.message);
      setPreferences((p) => (p ? { ...p, pushEnabled: true } : p));
      setNotice('Reminders enabled. You can turn them off at any time.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications.');
    }
    setBusy(false);
  }
  async function disablePush() {
    setBusy(true);
    const result = await apiFetch('/api/push/subscribe', { method: 'DELETE', body: '{}' });
    if (result.ok) {
      const registration = await navigator.serviceWorker?.getRegistration();
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      setPreferences((p) => (p ? { ...p, pushEnabled: false } : p));
      setNotice('Reminders disabled.');
    } else setError(result.error.message);
    setBusy(false);
  }
  async function exportData() {
    setBusy(true);
    const result = await apiFetch<unknown>('/api/me/export', { method: 'POST' });
    if (result.ok) {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'learnarena-export.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Your export is ready.');
    } else setError(result.error.message);
    setBusy(false);
  }
  async function deleteAccount() {
    setBusy(true);
    const result = await apiFetch('/api/me/delete', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    });
    if (result.ok) window.location.assign('/sign-in');
    else {
      setError(result.error.message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Learning at your pace</h2>
        {!preferences ? (
          <p role="status">Loading preferences…</p>
        ) : (
          <>
            <label className="flex items-center gap-3">
              Daily practice goal
              <input
                type="number"
                min={1}
                max={20}
                value={preferences.dailyGoal}
                onChange={(e) =>
                  setPreferences({ ...preferences, dailyGoal: Number(e.target.value) })
                }
                className="w-20 rounded-md border bg-background p-2"
              />{' '}
              sessions
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={preferences.breakReminder}
                onChange={(e) =>
                  setPreferences({ ...preferences, breakReminder: e.target.checked })
                }
              />
              Offer a break after 45 minutes of continuous play
            </label>
            <h3 className="font-semibold">Optional reminders</h3>
            <p className="text-sm text-muted-foreground">
              Receive at most one practice reminder per local day. Reminders are off by default,
              skip days you have practised, and respect your quiet hours. You can opt out any time.
            </p>
            <div className="flex flex-wrap gap-4">
              <label>
                Quiet hours start
                <select
                  aria-label="Quiet hours start"
                  className="ml-2 rounded-md border bg-background p-2"
                  value={preferences.quietStart}
                  onChange={(e) =>
                    setPreferences({ ...preferences, quietStart: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                End
                <select
                  aria-label="Quiet hours end"
                  className="ml-2 rounded-md border bg-background p-2"
                  value={preferences.quietEnd}
                  onChange={(e) =>
                    setPreferences({ ...preferences, quietEnd: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                className="rounded-md border px-4 py-2"
                onClick={() => void (preferences.pushEnabled ? disablePush() : enablePush())}
              >
                {preferences.pushEnabled ? 'Turn off reminders' : 'Enable reminders'}
              </button>
              <button
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={() => void save()}
              >
                Save preferences
              </button>
            </div>
          </>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Your data</h2>
        <p>Download your profile, answers, learning history, rewards, and settings as JSON.</p>
        <button
          disabled={busy}
          className="rounded-md border px-4 py-2"
          onClick={() => void exportData()}
        >
          Download my data
        </button>
        <hr />
        <h3 className="font-semibold">Delete account</h3>
        <p className="text-sm text-muted-foreground">
          This permanently removes your sign-in and personal profile. Anonymous learning and scoring
          records remain so shared match histories stay consistent. This cannot be undone.
        </p>
        <label className="block">
          Type DELETE to confirm
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="mt-2 block rounded-md border bg-background p-2"
          />
        </label>
        <button
          disabled={busy || confirmation !== 'DELETE'}
          className="rounded-md bg-destructive px-4 py-2 text-destructive-foreground disabled:opacity-50"
          onClick={() => void deleteAccount()}
        >
          Permanently delete my account
        </button>
      </section>
    </div>
  );
}
