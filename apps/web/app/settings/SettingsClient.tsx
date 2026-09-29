'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/hooks/useApi';
import { SettingsForm } from '@/components/ui-app/SettingsForm';
export function SettingsClient({
  displayName,
  timezone,
}: {
  displayName: string;
  timezone: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await apiFetch('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: name, timezone: zone }),
    });
    setBusy(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else
      setError(
        result.error.code === 'TIMEZONE_CHANGE_COOLDOWN'
          ? 'Please wait 24 hours after your last timezone change.'
          : result.error.code === 'USERNAME_TAKEN'
            ? 'That username is already taken.'
            : result.error.code === 'INVALID_INPUT'
              ? 'Check your display name and timezone.'
              : result.error.message,
      );
  }
  return (
    <SettingsForm
      displayName={name}
      timezone={zone}
      busy={busy}
      error={error}
      saved={saved}
      onName={setName}
      onTimezone={setZone}
      onSubmit={() => void save()}
    />
  );
}
