import { and, asc, eq, sql } from 'drizzle-orm';
import { AppError, uuidv7 } from '@learnarena/core';
import type { Database } from '../client';
import {
  categories,
  dailyChallengeQuestions,
  dailyChallenges,
  pointLedger,
  questionVersions,
} from '../schema';
export async function findDailyChallenge(db: Database, date: string) {
  const [challenge] = await db
    .select()
    .from(dailyChallenges)
    .where(eq(dailyChallenges.challengeDate, date));
  if (!challenge) return null;
  const questions = await db
    .select({
      id: questionVersions.id,
      categoryId: questionVersions.categoryId,
      categorySlug: categories.slug,
    })
    .from(dailyChallengeQuestions)
    .innerJoin(questionVersions, eq(questionVersions.id, dailyChallengeQuestions.questionVersionId))
    .innerJoin(categories, eq(categories.id, questionVersions.categoryId))
    .where(eq(dailyChallengeQuestions.dailyChallengeId, challenge.id))
    .orderBy(asc(dailyChallengeQuestions.position));
  return { ...challenge, questions };
}
export async function publishDailyChallenge(
  db: Database,
  date: string,
  versionIds: string[],
  actor: string,
  now: Date,
) {
  if (versionIds.length !== 10 || new Set(versionIds).size !== 10)
    throw new AppError('INVALID_INPUT');
  // Lock the date even when no row exists; concurrent curations cannot interleave.
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`daily:${date}`}))`);
  const existing = await findDailyChallenge(db, date);
  if (existing) {
    if (existing.questions.map((q) => q.id).join() !== versionIds.join())
      throw new AppError('INVALID_INPUT', { message: 'This challenge is already published.' });
    return existing.id;
  }
  const id = uuidv7();
  for (const versionId of versionIds) {
    const [version] = await db
      .select()
      .from(questionVersions)
      .where(and(eq(questionVersions.id, versionId), eq(questionVersions.status, 'LIVE')));
    if (!version)
      throw new AppError('INVALID_INPUT', {
        message: 'Daily challenges require published questions.',
      });
  }
  await db
    .insert(dailyChallenges)
    .values({ id, challengeDate: date, createdBy: actor, createdAt: now });
  await db
    .insert(dailyChallengeQuestions)
    .values(
      versionIds.map((questionVersionId, position) => ({
        dailyChallengeId: id,
        position,
        questionVersionId,
      })),
    );
  return id;
}
export function dailyBonusKey(date: string, userId: string) {
  return `daily:${date}:user:${userId}`;
}
export async function hasDailyBonus(db: Database, date: string, userId: string) {
  return (
    (
      await db
        .select({ id: pointLedger.id })
        .from(pointLedger)
        .where(eq(pointLedger.idempotencyKey, dailyBonusKey(date, userId)))
        .limit(1)
    ).length > 0
  );
}
export async function findDailyChallengeById(db: Database, id: string) {
  return (await db.select().from(dailyChallenges).where(eq(dailyChallenges.id, id)))[0];
}
