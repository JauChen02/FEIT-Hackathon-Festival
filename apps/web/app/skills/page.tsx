import { redirect } from 'next/navigation';
import { findUserById } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { SkillsClient } from './SkillsClient';

export const dynamic = 'force-dynamic';

/** Skills (PLANNING.md §20 screen 7). */
export default async function SkillsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const profile = await findUserById(db(), user.id);
  if (!profile) redirect('/onboarding');

  return (
    <main className="flex min-h-dvh justify-center p-(--spacing-gutter)">
      <div className="w-full max-w-(--container-content)">
        <SkillsClient />
      </div>
    </main>
  );
}
