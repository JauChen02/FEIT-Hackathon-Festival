'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OnboardingForm, type OnboardingValues } from '@/components/ui-app/OnboardingForm';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * The interactive half of §20 screen 2.
 *
 * Owns exactly two things the form must not: the browser's detected timezone,
 * and the POST (via `useOnboarding`).
 */
export function OnboardingClient({ timezones }: { timezones: readonly string[] }) {
  const router = useRouter();
  const { submitting, error, mutate } = useOnboarding();
  const [detected, setDetected] = useState('UTC');

  useEffect(() => {
    // §12.1: "auto-detected from the browser at onboarding and confirmed by the
    // user". Only after mount — the server has no idea what zone the user is in,
    // and guessing during SSR would cause a hydration mismatch.
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone && timezones.includes(zone)) setDetected(zone);
    } catch {
      // Keep the UTC default; the user can pick from the list.
    }
  }, [timezones]);

  async function submit(values: OnboardingValues) {
    const result = await mutate(values);
    if (result.ok) {
      router.replace('/home');
      router.refresh();
    }
  }

  return (
    <OnboardingForm
      key={detected}
      timezones={timezones}
      detectedTimezone={detected}
      submitting={submitting}
      error={error}
      onSubmit={submit}
    />
  );
}
