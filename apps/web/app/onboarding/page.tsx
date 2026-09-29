import { redirect } from 'next/navigation';
import { supportedTimezones } from '@learnarena/core';
import { findUserById } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { OnboardingClient } from './OnboardingClient';

export const dynamic = 'force-dynamic';

/**
 * Onboarding (PLANNING.md §20 screen 2).
 *
 * A server component guards the route and supplies the timezone list; the
 * interactive part lives in `OnboardingClient` (ADR-021: data and state in the
 * route/hook layer, presentation in components/ui-app/).
 */
export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  // Already onboarded (ADR-022: the row is the state) — nothing to do here.
  const existing = await findUserById(db(), user.id);
  if (existing) redirect('/home');

  return (
    <main className="flex min-h-dvh items-center justify-center p-(--spacing-gutter)">
      {/* Sent from the server so the list matches the ICU build that will
          validate it — see canonicalizeTimezone in @learnarena/core. */}
      <OnboardingClient timezones={supportedTimezones()} />
    </main>
  );
}
