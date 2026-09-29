import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SessionResult } from '@learnarena/core';
import { findSessionById } from '@learnarena/db';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MissedQuestionReview } from '@/components/ui-app/MissedQuestionReview';
import { PointsBreakdownCard } from '@/components/ui-app/PointsBreakdownCard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The results screen (PLANNING.md §20 screen 6).
 *
 * Rendered from the frozen `result_json`, which is why it survives a reload
 * unchanged (§24: "results survive a page reload"). Streak, recommendation and
 * skill deltas arrive in Phases 2 and 3.
 */
export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const session = await findSessionById(db(), sessionId);
  if (!session || session.ownerId !== user.id) redirect('/home');

  // Still playable: send the learner back to finish it.
  if (session.status === 'CREATED' || session.status === 'ACTIVE') {
    redirect(`/play/${sessionId}`);
  }

  const result = session.resultJson as SessionResult | null;

  return (
    <main className="flex min-h-dvh justify-center p-(--spacing-gutter)">
      <div className="flex w-full max-w-(--container-content) flex-col gap-6">
        {result ? (
          <>
            <PointsBreakdownCard
              breakdown={result.pointsBreakdown}
              finalPoints={result.finalPoints}
            />

            <MissedQuestionReview
              review={result.review}
              questionCount={result.questionCount}
              correctCount={result.correctCount}
            />
          </>
        ) : (
          // ABANDONED, EXPIRED or CANCELLED: no points and no review (§10.4).
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No results for this quiz</CardTitle>
              <CardDescription>
                {session.status === 'ABANDONED'
                  ? 'You abandoned this quiz, so it did not earn any points.'
                  : session.status === 'EXPIRED'
                    ? 'This quiz timed out, so it did not earn any points.'
                    : 'This quiz was cancelled before it started.'}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex gap-2">
          <Button asChild data-testid="back-home">
            <Link href="/home">Back to home</Link>
          </Button>
          <Button asChild variant="outline" data-testid="view-history">
            <Link href="/history">History</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
