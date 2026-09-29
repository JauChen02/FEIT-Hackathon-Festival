import { ActivityClient } from './ActivityClient';
import { redirect } from 'next/navigation';
import { findSessionById, activityForSession } from '@learnarena/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { QuizClient } from './QuizClient';

export const dynamic = 'force-dynamic';

/**
 * The quiz screen (PLANNING.md §20 screen 5).
 *
 * The server component guards the route and resolves the session; `QuizClient`
 * runs the loop (ADR-021: data and state in the route/hook layer).
 */
export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const session = await findSessionById(db(), sessionId);

  // Not yours, or not there: the same outcome either way, so existence is not
  // leaked (§16.1).
  if (!session || session.ownerId !== user.id || session.mode !== 'SOLO') redirect('/home');

  // A finished session belongs on the results screen, not the quiz screen.
  if (session.status === 'COMPLETED') redirect(`/results/${sessionId}`);
  if (session.status !== 'CREATED' && session.status !== 'ACTIVE') redirect('/home');

  return (
    <main className="flex min-h-dvh justify-center p-(--spacing-gutter)">
      <div className="w-full max-w-(--container-content)">
        {(await activityForSession(db(), sessionId)) ? (
          <ActivityClient sessionId={sessionId} />
        ) : (
          <QuizClient sessionId={sessionId} />
        )}
      </div>
    </main>
  );
}
