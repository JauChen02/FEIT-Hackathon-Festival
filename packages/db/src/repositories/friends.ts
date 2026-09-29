import { and, eq, or, sql } from 'drizzle-orm';
import {
  AppError,
  canRequestAgain,
  friendshipTransitions,
  normalizedPair,
  uuidv7,
} from '@learnarena/core';
import type { Database } from '../client';
import { friendships, inviteLinks, userBlocks, users } from '../schema';
import { findUserById, findUserByUsername } from './users';
export async function pairBlocked(db: Database, a: string, b: string) {
  return (
    (
      await db
        .select()
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
            and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
          ),
        )
        .limit(1)
    ).length > 0
  );
}
async function pairLock(db: Database, a: string, b: string) {
  if (a === b) throw new AppError('INVALID_INPUT');
  const [low, high] = normalizedPair(a, b);
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`friend:${low}:${high}`}))`);
  return { low, high };
}
export async function requestFriend(db: Database, userId: string, username: string, now: Date) {
  const other = await findUserByUsername(db, username);
  if (!other) throw new AppError('FORBIDDEN');
  const { low, high } = await pairLock(db, userId, other.id);
  if (await pairBlocked(db, low, high)) throw new AppError('FORBIDDEN');
  const [existing] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)));
  if (existing && ['PENDING', 'ACCEPTED'].includes(existing.status)) return existing;
  if (existing && !canRequestAgain(existing.status, existing.respondedAt, now))
    throw new AppError('FORBIDDEN');
  if (existing) {
    friendshipTransitions.assertTransition(existing.status, 'PENDING');
    return (
      await db
        .update(friendships)
        .set({
          status: 'PENDING',
          requestedBy: userId,
          createdAt: now,
          respondedAt: null,
          acceptedAt: null,
          endedAt: null,
        })
        .where(and(eq(friendships.id, existing.id), eq(friendships.status, existing.status)))
        .returning()
    )[0]!;
  }
  return (
    await db
      .insert(friendships)
      .values({
        id: uuidv7(),
        userLowId: low,
        userHighId: high,
        requestedBy: userId,
        status: 'PENDING',
        createdAt: now,
      })
      .returning()
  )[0]!;
}
export async function changeFriendRequest(
  db: Database,
  userId: string,
  id: string,
  action: 'accept' | 'decline' | 'cancel',
  now: Date,
) {
  const [found] = await db.select().from(friendships).where(eq(friendships.id, id));
  if (!found || ![found.userLowId, found.userHighId].includes(userId))
    throw new AppError('FORBIDDEN');
  await pairLock(db, found.userLowId, found.userHighId);
  if (await pairBlocked(db, found.userLowId, found.userHighId)) throw new AppError('FORBIDDEN');
  const [row] = await db.select().from(friendships).where(eq(friendships.id, id));
  if (!row) throw new AppError('NOT_FOUND');
  if ((action === 'cancel') !== (row.requestedBy === userId)) throw new AppError('FORBIDDEN');
  const status = action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : 'CANCELLED';
  if (row.status === status) return row;
  if (!friendshipTransitions.canTransition(row.status, status)) throw new AppError('INVALID_INPUT');
  return (
    await db
      .update(friendships)
      .set({
        status,
        respondedAt: now,
        ...(status === 'ACCEPTED' ? { acceptedAt: now } : { endedAt: now }),
      })
      .where(and(eq(friendships.id, id), eq(friendships.status, row.status)))
      .returning()
  )[0];
}
export async function removeFriend(db: Database, userId: string, otherId: string, now: Date) {
  const { low, high } = await pairLock(db, userId, otherId);
  await db
    .update(friendships)
    .set({ status: 'REMOVED', endedAt: now })
    .where(and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)));
}
export async function blockUser(db: Database, userId: string, otherId: string, now: Date) {
  if (!(await findUserById(db, otherId))) throw new AppError('FORBIDDEN');
  await removeFriend(db, userId, otherId, now);
  await db
    .insert(userBlocks)
    .values({ blockerId: userId, blockedId: otherId, createdAt: now })
    .onConflictDoNothing();
}
export async function unblockUser(db: Database, userId: string, otherId: string) {
  await pairLock(db, userId, otherId);
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherId)));
}
export async function listFriends(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId)));
  const result = [];
  for (const row of rows) {
    if (!['PENDING', 'ACCEPTED'].includes(row.status)) continue;
    const otherId = row.userLowId === userId ? row.userHighId : row.userLowId;
    if (await pairBlocked(db, userId, otherId)) continue;
    const profile = await findUserById(db, otherId);
    if (profile)
      result.push({
        id: row.id,
        userId: otherId,
        username: profile.username,
        displayName: profile.displayName,
        status: row.status,
        incoming: row.requestedBy !== userId,
        acceptedAt: row.acceptedAt,
      });
  }
  const blocked = await db
    .select({ userId: users.id, username: users.username, displayName: users.displayName })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, userId));
  return { friends: result, blocked };
}
export async function acceptedFriendIds(db: Database, userId: string) {
  return (await listFriends(db, userId)).friends
    .filter((row) => row.status === 'ACCEPTED')
    .map((row) => row.userId);
}
export async function createFriendInvite(db: Database, userId: string, code: string, now: Date) {
  const id = uuidv7();
  await db
    .insert(inviteLinks)
    .values({
      id,
      code,
      createdBy: userId,
      purpose: 'FRIEND',
      expiresAt: new Date(now.getTime() + 7 * 86400000),
      maxUses: 1,
      createdAt: now,
    });
  return { code, expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() };
}
export async function redeemFriendInvite(db: Database, userId: string, code: string, now: Date) {
  const [invite] = await db
    .select()
    .from(inviteLinks)
    .where(eq(inviteLinks.code, code))
    .for('update');
  if (
    !invite ||
    invite.purpose !== 'FRIEND' ||
    invite.expiresAt <= now ||
    (invite.uses >= invite.maxUses && invite.redeemedBy !== userId)
  )
    throw new AppError('FORBIDDEN');
  if (invite.redeemedBy === userId) {
    if (await pairBlocked(db, userId, invite.createdBy)) throw new AppError('FORBIDDEN');
    const [low, high] = normalizedPair(userId, invite.createdBy);
    const [existing] = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)));
    if (existing) return existing;
    throw new AppError('FORBIDDEN');
  }
  const creator = await findUserById(db, invite.createdBy);
  if (!creator) throw new AppError('FORBIDDEN');
  const friendship = await requestFriend(db, userId, creator.username, now);
  await db
    .update(inviteLinks)
    .set({ uses: invite.uses + 1, redeemedBy: userId })
    .where(eq(inviteLinks.id, invite.id));
  return friendship;
}

export async function blockedUserIds(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
}
