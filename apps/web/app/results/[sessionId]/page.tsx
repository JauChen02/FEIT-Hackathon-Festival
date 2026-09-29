import { restoreCompletedResult } from '@/lib/sessions/completeSession';
import { CoachMessage } from '@/components/ui-app/CoachMessage';
import { StreakCard } from '@/components/ui-app/StreakCard';
import { MilestoneBanner } from '@/components/ui-app/MilestoneBanner';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { SessionResult } from '@learnarena/core';
import { findSessionById, lobbies, lobbyMembers } from '@learnarena/db';
import { and, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MissedQuestionReview } from '@/components/ui-app/MissedQuestionReview';
import { PointsBreakdownCard } from '@/components/ui-app/PointsBreakdownCard';
import { SkillDeltasClient } from './SkillDeltasClient';
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
  if (session && session.mode !== 'SOLO') {
    const [lobby] = await db()
      .select({ code: lobbies.code })
      .from(lobbies)
      .innerJoin(
        lobbyMembers,
        and(eq(lobbyMembers.lobbyId, lobbies.id), eq(lobbyMembers.userId, user.id)),
      )
      .where(eq(lobbies.sessionId, session.id));
    if (lobby) redirect(`/lobbies/${lobby.code}`);
    redirect('/home');
  }
  if (!session || session.ownerId !== user.id) redirect('/home');

  // Still playable: send the learner back to finish it.
  if (session.status === 'CREATED' || session.status === 'ACTIVE') {
    redirect(`/play/${sessionId}`);
  }

  const result =
    (session.resultJson as SessionResult | null) ??
    (session.status === 'COMPLETED'
      ? await db().transaction((tx) => restoreCompletedResult(tx, session))
      : null);

  return (
    <main className="flex min-h-dvh justify-center p-(--spacing-gutter)">
      <div className="flex w-full max-w-(--container-content) flex-col gap-6">
        {result ? (
          <>
            <PointsBreakdownCard
              breakdown={result.pointsBreakdown}
              finalPoints={result.finalPoints}
            />

            {/*
              §18.3 runs the Coach job *after* the completion transaction
              commits, so the deltas are usually not ready when this page first
              renders. The client polls briefly rather than blocking the
              results behind them (§20 screen 6).
            */}
            {result.streak ? <StreakCard streak={result.streak} /> : null}
            {result.streak?.milestone ? <MilestoneBanner days={result.streak.milestone} /> : null}
            {result.dailyChallengeBonus ? (
              <p data-testid="daily-bonus" className="rounded-lg bg-accent p-4 font-semibold">
                Daily challenge complete: +{result.dailyChallengeBonus} bonus points
              </p>
            ) : null}
            <SkillDeltasClient sessionId={sessionId} />
            <CoachMessage sessionId={sessionId} />

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
          <Button asChild variant="outline" data-testid="view-skills">
            <Link href="/skills">Skills</Link>
          </Button>
          <Button asChild variant="outline" data-testid="view-history">
            <Link href="/history">History</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
