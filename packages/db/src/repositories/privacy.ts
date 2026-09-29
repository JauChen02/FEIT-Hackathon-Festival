import { and, eq, or, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { AppError } from '@learnarena/core';
import * as t from '../schema';
import { lockStreakUser } from './streaks';
export async function exportUserData(db: Database, userId: string, at: Date) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const [profile] = await tx.select().from(t.users).where(eq(t.users.id, userId));
    if (!profile) throw new AppError('NOT_FOUND');
    const sessions = await tx
      .select({ session: t.gameSessions })
      .from(t.gameSessions)
      .innerJoin(
        t.sessionPlayers,
        and(eq(t.sessionPlayers.sessionId, t.gameSessions.id), eq(t.sessionPlayers.userId, userId)),
      );
    return {
      formatVersion: 1,
      exportedAt: at.toISOString(),
      profile,
      sessions: sessions.map(({ session }) => {
        const result = session.resultJson as {
          multiplayer?: boolean;
          players?: { userId: string }[];
          rounds?: { perPlayer: { userId: string }[] }[];
        } | null;
        return {
          ...session,
          resultJson: result?.multiplayer
            ? {
                ...result,
                players: result.players?.filter((p) => p.userId === userId),
                rounds: result.rounds?.map((r) => ({
                  ...r,
                  perPlayer: r.perPlayer.filter((p) => p.userId === userId),
                })),
              }
            : result,
        };
      }),
      answers: await tx.select().from(t.answers).where(eq(t.answers.userId, userId)),
      learningEvents: await tx
        .select()
        .from(t.learningEvents)
        .where(eq(t.learningEvents.userId, userId)),
      skillUpdates: await tx.select().from(t.skillUpdates).where(eq(t.skillUpdates.userId, userId)),
      skillProfiles: await tx
        .select()
        .from(t.skillProfiles)
        .where(eq(t.skillProfiles.userId, userId)),
      pointLedger: await tx.select().from(t.pointLedger).where(eq(t.pointLedger.userId, userId)),
      streakDays: await tx.select().from(t.streakDays).where(eq(t.streakDays.userId, userId)),
      freezes: await tx.select().from(t.streakFreezes).where(eq(t.streakFreezes.userId, userId)),
      timezoneChanges: await tx
        .select()
        .from(t.userTimezoneChanges)
        .where(eq(t.userTimezoneChanges.userId, userId)),
      recommendations: await tx
        .select()
        .from(t.recommendations)
        .where(eq(t.recommendations.userId, userId)),
      activities: (
        await tx
          .select()
          .from(t.activityAssessments)
          .where(eq(t.activityAssessments.userId, userId))
      ).map((row) => ({
        ...row,
        answerJson: row.outcome ? row.answerJson : undefined,
        explanation: row.outcome ? row.explanation : undefined,
      })),
      friendships: await tx
        .select()
        .from(t.friendships)
        .where(or(eq(t.friendships.userLowId, userId), eq(t.friendships.userHighId, userId))),
      blocks: await tx.select().from(t.userBlocks).where(eq(t.userBlocks.blockerId, userId)),
      invites: await tx.select().from(t.inviteLinks).where(eq(t.inviteLinks.createdBy, userId)),
      coachMessages: await tx
        .select()
        .from(t.coachMessages)
        .where(eq(t.coachMessages.userId, userId)),
      achievements: await tx
        .select()
        .from(t.userAchievements)
        .where(eq(t.userAchievements.userId, userId)),
      notificationPreferences: await tx
        .select()
        .from(t.notificationPreferences)
        .where(eq(t.notificationPreferences.userId, userId)),
      pushSubscriptions: await tx
        .select()
        .from(t.pushSubscriptions)
        .where(eq(t.pushSubscriptions.userId, userId)),
      notificationSendLog: await tx
        .select()
        .from(t.notificationSendLog)
        .where(eq(t.notificationSendLog.userId, userId)),
      activityEvents: await tx
        .select()
        .from(t.activityEvents)
        .where(eq(t.activityEvents.actorId, userId)),
      friendBonusGrants: await tx
        .select()
        .from(t.friendBonusGrants)
        .where(
          or(eq(t.friendBonusGrants.userLowId, userId), eq(t.friendBonusGrants.userHighId, userId)),
        ),
      roles: await tx.select().from(t.userRoles).where(eq(t.userRoles.userId, userId)),
    };
  });
}
export async function anonymizeUser(db: Database, userId: string, at: Date) {
  return db.transaction(async (tx) => {
    const user = await lockStreakUser(tx, userId);
    if (!user) throw new AppError('NOT_FOUND');
    if (user.deletedAt) return { deleted: true };
    await tx
      .update(t.users)
      .set({
        username: `deleted_${userId.replaceAll('-', '').slice(-12)}`,
        displayName: '',
        timezone: 'UTC',
        ageConfirmedAt: null,
        onboardingCompletedAt: null,
        deletedAt: at,
        updatedAt: at,
      })
      .where(eq(t.users.id, userId));
    await tx.insert(t.deletionRequests).values({ userId, requestedAt: at }).onConflictDoNothing();
    await tx.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, userId));
    await tx.delete(t.notificationPreferences).where(eq(t.notificationPreferences.userId, userId));
    await tx.delete(t.coachMessages).where(eq(t.coachMessages.userId, userId));
    await tx.delete(t.activityEvents).where(eq(t.activityEvents.actorId, userId));
    await tx.delete(t.userTimezoneChanges).where(eq(t.userTimezoneChanges.userId, userId));
    await tx.delete(t.userRoles).where(eq(t.userRoles.userId, userId));
    await tx
      .update(t.inviteLinks)
      .set({ expiresAt: at })
      .where(eq(t.inviteLinks.createdBy, userId));
    await tx
      .update(t.friendships)
      .set({ status: 'REMOVED', endedAt: at })
      .where(or(eq(t.friendships.userLowId, userId), eq(t.friendships.userHighId, userId)));
    await tx
      .delete(t.userBlocks)
      .where(or(eq(t.userBlocks.blockerId, userId), eq(t.userBlocks.blockedId, userId)));
    await tx
      .update(t.answers)
      .set({ responseJson: null, clientSentAt: null })
      .where(eq(t.answers.userId, userId));
    await tx
      .update(t.activityAssessments)
      .set({ responseJson: null })
      .where(eq(t.activityAssessments.userId, userId));
    // Canonical numeric outcomes are retained; user-supplied review text is removed from caches.
    await tx
      .update(t.gameSessions)
      .set({ resultJson: null })
      .where(and(eq(t.gameSessions.ownerId, userId), eq(t.gameSessions.mode, 'SOLO')));
    await tx
      .update(t.gameSessions)
      .set({ status: 'CANCELLED', endedAt: at })
      .where(
        and(
          eq(t.gameSessions.ownerId, userId),
          eq(t.gameSessions.mode, 'SOLO'),
          sql`${t.gameSessions.status} in ('CREATED','ACTIVE')`,
        ),
      );
    const authored = await tx
      .select()
      .from(t.adminAuditLog)
      .where(eq(t.adminAuditLog.actorId, userId));
    for (const row of authored)
      await tx
        .update(t.adminAuditLog)
        .set({ beforeJson: null, afterJson: null })
        .where(eq(t.adminAuditLog.id, row.id));
    return { deleted: true };
  });
}
