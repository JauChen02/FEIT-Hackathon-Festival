import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findUserById, listLaunchCategories } from '@learnarena/db';
import { Button } from '@/components/ui/button';
import { HomeSummary } from '@/components/ui-app/HomeSummary';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { HomeClient } from './HomeClient';

export const dynamic = 'force-dynamic';

/**
 * Home (PLANNING.md §20 screen 3).
 *
 * The category buttons start a quiz and the "Focus today" card carries the
 * Coach's daily pick. The streak flame needs Phase 2.
 *
 * ADR-021: this route file does the fetching; the components only render.
 */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const profile = await findUserById(db(), user.id);
  if (!profile) redirect('/onboarding');

  const categories = await listLaunchCategories(db());

  return (
    <main className="flex min-h-dvh justify-center p-(--spacing-gutter)">
      <div className="flex w-full max-w-(--container-content) flex-col gap-6">
        <HomeSummary
          displayName={profile.displayName}
          username={profile.username}
          timezone={profile.timezone}
          totalPoints={profile.totalPointsCached}
        />

        <HomeClient
          categories={categories.map((category) => ({
            slug: category.slug,
            name: category.name,
            liveQuestionCount: category.liveQuestionCount,
          }))}
        />

        <div className="flex gap-2">
          <Button asChild variant="outline" data-testid="home-skills-link">
            <Link href="/skills">Skills</Link>
          </Button>
          <Button asChild variant="outline" data-testid="home-history-link">
            <Link href="/history">History</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
