import 'server-only';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  achievementIds,
  localDateFor,
  systemClock,
  templateNarration,
  uuidv7,
  validateNarration,
  weekKeyUtc,
  type NarrationSnapshot,
} from '@learnarena/core';
import {
  activityEvents,
  coachMessages,
  friendBonusGrants,
  gameSessions,
  gameTypes,
  learningEvents,
  matchResults,
  recommendations,
  userAchievements,
  users,
} from '@learnarena/db';
import { db } from '../../db';
import { loadCoachSignals } from '../../coach/signals';
import { callAnthropic } from '../../coach/narration/anthropic';
import { logger } from '../../logger';
import { inngest } from '../client';
import { runProcessSession } from './coachJobs';
export async function narrationSnapshot(
  userId: string,
  sessionId: string | null,
  at: Date,
): Promise<NarrationSnapshot> {
  const [user] = await db()
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!user) throw new Error('User unavailable');
  const signals = await loadCoachSignals(db(), userId, at);
  const sorted = [...signals.derived].sort((a, b) => a.weaknessScore - b.weaknessScore);
  const events = await db()
    .select({
      correctness: learningEvents.correctness,
      subTopic: learningEvents.subTopic,
      game: gameTypes.slug,
    })
    .from(learningEvents)
    .innerJoin(gameTypes, eq(gameTypes.id, learningEvents.gameTypeId))
    .where(
      and(
        eq(learningEvents.userId, userId),
        sessionId
          ? eq(learningEvents.sessionId, sessionId)
          : sql`${learningEvents.occurredAt} >= ${new Date(at.getTime() - 7 * 86400000).toISOString()}::timestamptz`,
      ),
    );
  const [rec] = await db()
    .select({
      category: recommendations.categoryId,
      bonus: recommendations.status,
      game: gameTypes.slug,
    })
    .from(recommendations)
    .innerJoin(gameTypes, eq(gameTypes.id, recommendations.gameTypeId))
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.localDate, localDateFor(user.timezone, at)),
      ),
    )
    .limit(1);
  return {
    display_name: user.displayName,
    strengths: sorted
      .slice(0, 2)
      .map((s) => ({ category: s.categorySlug, proficiency: Math.round(s.proficiency) })),
    weaknesses: sorted
      .slice(-2)
      .reverse()
      .map((s) => ({
        category: s.categorySlug,
        proficiency: Math.round(s.proficiency),
        games_played: s.exposureCount,
      })),
    last_session: {
      game_type: events[0]?.game ?? 'practice',
      accuracy: events.length
        ? events.reduce((a, b) => a + Number(b.correctness), 0) / events.length
        : 0,
      missed_sub_topics: [
        ...new Set(
          events.filter((e) => Number(e.correctness) < 1 && e.subTopic).map((e) => e.subTopic!),
        ),
      ].slice(0, 8),
    },
    recommendation: rec
      ? {
          category: signals.categoryById.get(rec.category)?.slug ?? 'practice',
          game_type: rec.game,
          bonus: ['AVAILABLE', 'IN_PROGRESS'].includes(rec.bonus) ? '1.5x' : '1x',
        }
      : null,
  };
}
export async function runNarration(
  userId: string,
  sessionId: string | null,
  at: Date = systemClock.now(),
  provider = callAnthropic,
) {
  const kind = sessionId ? 'SESSION' : 'WEEKLY',
    refKey = sessionId ?? weekKeyUtc(at);
  const [existing] = await db()
    .select()
    .from(coachMessages)
    .where(
      and(
        eq(coachMessages.userId, userId),
        eq(coachMessages.kind, kind),
        eq(coachMessages.refKey, refKey),
      ),
    );
  if (existing) return existing;
  if (sessionId) {
    const [session] = await db().select().from(gameSessions).where(eq(gameSessions.id, sessionId));
    if (session?.status !== 'COMPLETED') return null;
    await runProcessSession(sessionId, userId, at);
  }
  const snapshot = await narrationSnapshot(userId, sessionId, at);
  let message = templateNarration(snapshot),
    source = 'TEMPLATE';
  try {
    const generated = validateNarration(await provider(snapshot));
    if (generated) {
      message = generated;
      source = 'ANTHROPIC';
    }
  } catch {
    logger.warn({ user_id: userId, session_id: sessionId }, 'coach.narration_fallback');
  }
  const [row] = await db()
    .insert(coachMessages)
    .values({
      id: uuidv7(),
      userId,
      kind,
      refKey,
      sessionId,
      weekKey: sessionId ? null : refKey,
      message,
      source,
      inputSnapshotJson: snapshot,
      createdAt: at,
    })
    .onConflictDoNothing()
    .returning();
  return (
    row ??
    (
      await db()
        .select()
        .from(coachMessages)
        .where(
          and(
            eq(coachMessages.userId, userId),
            eq(coachMessages.kind, kind),
            eq(coachMessages.refKey, refKey),
          ),
        )
    )[0]
  );
}
export async function runAchievements(userId: string, at: Date = systemClock.now()) {
  const signals = await loadCoachSignals(db(), userId, at);
  const recs = await db()
    .select({ id: recommendations.id })
    .from(recommendations)
    .where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'COMPLETED')));
  const matches = await db()
    .select({ result: matchResults.resultJson })
    .from(matchResults)
    .where(
      sql`exists(select 1 from ${friendBonusGrants} where ${friendBonusGrants.sessionId} = ${matchResults.sessionId} and (${friendBonusGrants.userLowId} = ${userId} or ${friendBonusGrants.userHighId} = ${userId}))`,
    );
  const wins = matches.filter(
    (row) =>
      (row.result as { mode: string; players: { userId: string; outcome: string }[] }).mode ===
        'team_deathmatch' &&
      (row.result as { players: { userId: string; outcome: string }[] }).players.some(
        (p) => p.userId === userId && p.outcome === 'WIN',
      ),
  ).length;
  const earned = achievementIds({
    skills: signals.derived,
    completedRecommendations: recs.length,
    friendDeathmatchWins: wins,
  });
  return db().transaction(async (tx) => {
    for (const id of earned) {
      await tx
        .insert(userAchievements)
        .values({ userId, achievementId: id, earnedAt: at })
        .onConflictDoNothing();
      await tx
        .insert(activityEvents)
        .values({
          id: uuidv7(),
          actorId: userId,
          kind: 'ACHIEVEMENT',
          refId: id,
          message: `Earned ${id === 'renaissance' ? 'Renaissance Mind' : id === 'weakness_slayer' ? 'Weakness Slayer' : 'Team Player'}`,
          createdAt: at,
        })
        .onConflictDoNothing();
    }
    return earned;
  });
}
export const narrateSession = inngest.createFunction(
  {
    id: 'coach-narrate-session',
    retries: 5,
    concurrency: { key: 'event.data.userId', limit: 1 },
    triggers: [{ event: 'session/terminal' }],
  },
  async ({ event, step }) =>
    step.run('narrate', () => runNarration(event.data.userId, event.data.sessionId)),
);
export const evaluateAchievements = inngest.createFunction(
  { id: 'achievements-evaluate', retries: 5, triggers: [{ event: 'session/terminal' }] },
  async ({ event, step }) => {
    await step.run('skills', () => runProcessSession(event.data.sessionId, event.data.userId));
    return step.run('achievements', () => runAchievements(event.data.userId));
  },
);
export const weeklyNarration = inngest.createFunction(
  { id: 'coach-weekly-report', retries: 5, triggers: [{ cron: '0 9 * * 1' }] },
  async ({ step }) => {
    const ids = await step.run('users', async () =>
      db().select({ id: users.id }).from(users).where(isNull(users.deletedAt)),
    );
    for (const user of ids) await step.run(`report-${user.id}`, () => runNarration(user.id, null));
    return ids.length;
  },
);
export const retentionCleanup = inngest.createFunction(
  { id: 'privacy-retention-cleanup', triggers: [{ cron: '0 3 * * *' }] },
  async ({ step }) =>
    step.run('clear-old-inputs', () =>
      db()
        .update(coachMessages)
        .set({ inputSnapshotJson: null })
        .where(lt(coachMessages.createdAt, new Date(systemClock.now().getTime() - 90 * 86400000))),
    ),
);
export async function latestCoachMessage(userId: string, sessionId?: string) {
  return (
    (
      await db()
        .select({
          message: coachMessages.message,
          source: coachMessages.source,
          kind: coachMessages.kind,
          createdAt: coachMessages.createdAt,
        })
        .from(coachMessages)
        .where(
          and(
            eq(coachMessages.userId, userId),
            sessionId ? eq(coachMessages.sessionId, sessionId) : undefined,
          ),
        )
        .orderBy(desc(coachMessages.createdAt))
        .limit(1)
    )[0] ?? null
  );
}
export const engagementFunctions = [
  narrateSession,
  evaluateAchievements,
  weeklyNarration,
  retentionCleanup,
];
