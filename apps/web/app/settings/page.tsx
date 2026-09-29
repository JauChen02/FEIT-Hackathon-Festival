import { PrivacySettings } from './PrivacySettings';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findUserById } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { SettingsClient } from './SettingsClient';
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const profile = await findUserById(db(), user.id);
  if (!profile) redirect('/onboarding');
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--container-content) flex-col gap-6 p-(--spacing-gutter)">
      <Link href="/home">← Home</Link>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsClient displayName={profile.displayName} timezone={profile.timezone} />
      <PrivacySettings />
    </main>
  );
}
