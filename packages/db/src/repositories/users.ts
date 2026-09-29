/**
 * User repository (PLANNING.md §16.2).
 *
 * All I/O for the identity tables lives here so route handlers stay thin and
 * `packages/core` stays pure (§29).
 */

import { eq, isNull, and } from 'drizzle-orm';
import type { Database } from '../client';
import { users } from '../schema/index';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  timezone: string;
  ageConfirmedAt: Date | null;
  onboardingCompletedAt: Date | null;
  totalPointsCached: number;
  createdAt: Date;
}

const USER_COLUMNS = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  timezone: users.timezone,
  ageConfirmedAt: users.ageConfirmedAt,
  onboardingCompletedAt: users.onboardingCompletedAt,
  totalPointsCached: users.totalPointsCached,
  createdAt: users.createdAt,
} as const;

/**
 * Look up a user by their Supabase auth id.
 *
 * Returns undefined when the row does not exist, which is precisely the
 * "onboarding not finished" state (ADR-022). Soft-deleted users (§14.1) are
 * treated as absent.
 */
export async function findUserById(db: Database, id: string): Promise<UserRecord | undefined> {
  const rows = await db
    .select(USER_COLUMNS)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function findUserByUsername(
  db: Database,
  username: string,
): Promise<UserRecord | undefined> {
  const rows = await db
    .select(USER_COLUMNS)
    .from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export interface CreateOnboardedUserInput {
  id: string;
  username: string;
  displayName: string;
  timezone: string;
  now: Date;
}

/**
 * Create the user row that completes onboarding.
 *
 * `ON CONFLICT (id) DO NOTHING` makes a retry a no-op rather than an error, so
 * the endpoint is idempotent (§16.2) without a check-then-insert race. The
 * caller reads the row back afterwards, which also covers the case where a
 * concurrent request won.
 *
 * A duplicate *username* is a different matter and still raises 23505, which
 * the route translates to `409 USERNAME_TAKEN`.
 */
export async function insertOnboardedUser(
  db: Database,
  input: CreateOnboardedUserInput,
): Promise<{ inserted: boolean }> {
  const result = await db
    .insert(users)
    .values({
      id: input.id,
      username: input.username,
      displayName: input.displayName,
      timezone: input.timezone,
      ageConfirmedAt: input.now,
      onboardingCompletedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: users.id })
    .returning({ id: users.id });

  return { inserted: result.length > 0 };
}

export function isOnboarded(user: UserRecord | undefined): user is UserRecord {
  return user !== undefined && user.onboardingCompletedAt !== null;
}

/** Caller holds the user lock, serializing timezone edits and completion. */
export async function updateProfile(
  db: Database,
  userId: string,
  input: { displayName?: string | undefined; timezone?: string | undefined },
  now: Date,
) {
  const { userTimezoneChanges } = await import('../schema/index');
  const { desc } = await import('drizzle-orm');
  const { AppError, uuidv7 } = await import('@learnarena/core');
  const [user] = await db.select().from(users).where(eq(users.id, userId)).for('update');
  if (!user) throw new AppError('NOT_FOUND');
  if (input.timezone && input.timezone !== user.timezone) {
    const [last] = await db
      .select()
      .from(userTimezoneChanges)
      .where(eq(userTimezoneChanges.userId, userId))
      .orderBy(desc(userTimezoneChanges.changedAt))
      .limit(1);
    if (last && now.getTime() - last.changedAt.getTime() < 86_400_000) {
      throw new AppError('TIMEZONE_CHANGE_COOLDOWN', {
        details: { availableAt: new Date(last.changedAt.getTime() + 86_400_000).toISOString() },
      });
    }
    await db
      .insert(userTimezoneChanges)
      .values({
        id: uuidv7(),
        userId,
        oldTz: user.timezone,
        newTz: input.timezone,
        changedAt: now,
      });
  }
  await db
    .update(users)
    .set({ ...input, updatedAt: now })
    .where(eq(users.id, userId));
  return findUserById(db, userId);
}
