import { and, eq, inArray } from 'drizzle-orm';
import { AppError, lobbyTransitions, uuidv7, type MultiplayerMode } from '@learnarena/core';
import type { Database } from '../client';
import { lobbies, lobbyMembers, users, gameSessions } from '../schema';
import { pairBlocked } from './friends';
export async function lobbyView(db: Database, code: string, userId: string, now: Date) {
  const [lobby] = await db.select().from(lobbies).where(eq(lobbies.code, code));
  if (!lobby) throw new AppError('NOT_FOUND');
  const members = await db
    .select({ userId: users.id, displayName: users.displayName, username: users.username })
    .from(lobbyMembers)
    .innerJoin(users, eq(users.id, lobbyMembers.userId))
    .where(eq(lobbyMembers.lobbyId, lobby.id));
  if (!members.some((m) => m.userId === userId)) throw new AppError('FORBIDDEN');
  for (const member of members)
    if (await pairBlocked(db, userId, member.userId)) throw new AppError('FORBIDDEN');
  if (lobby.status === 'OPEN' && now.getTime() - lobby.updatedAt.getTime() >= 900000) {
    await db
      .update(lobbies)
      .set({ status: 'EXPIRED', updatedAt: now })
      .where(and(eq(lobbies.id, lobby.id), eq(lobbies.status, 'OPEN')));
    lobby.status = 'EXPIRED';
  }
  return { ...lobby, members };
}
export async function createLobby(
  db: Database,
  hostId: string,
  gameType: MultiplayerMode,
  code: string,
  now: Date,
) {
  const [row] = await db
    .insert(lobbies)
    .values({
      id: uuidv7(),
      code,
      hostId,
      gameType,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(lobbyMembers).values({ lobbyId: row!.id, userId: hostId, joinedAt: now });
  return row!;
}
export async function joinLobby(db: Database, code: string, userId: string, now: Date) {
  const [lobby] = await db.select().from(lobbies).where(eq(lobbies.code, code)).for('update');
  if (!lobby) throw new AppError('NOT_FOUND');
  const members = await db.select().from(lobbyMembers).where(eq(lobbyMembers.lobbyId, lobby.id));
  for (const member of members)
    if (await pairBlocked(db, userId, member.userId)) throw new AppError('FORBIDDEN');
  if (members.some((m) => m.userId === userId)) return lobby;
  if (lobby.status !== 'OPEN' || now.getTime() - lobby.updatedAt.getTime() >= 900000)
    throw new AppError('INVALID_SESSION_STATE');
  if (members.length >= (lobby.gameType === 'quiz_coop' ? 6 : 10)) throw new AppError('FORBIDDEN');
  await db.insert(lobbyMembers).values({ lobbyId: lobby.id, userId, joinedAt: now });
  await db.update(lobbies).set({ updatedAt: now }).where(eq(lobbies.id, lobby.id));
  return lobby;
}
export async function transitionLobby(
  db: Database,
  id: string,
  from: typeof lobbies.$inferSelect.status,
  to: typeof lobbies.$inferSelect.status,
  now: Date,
) {
  lobbyTransitions.assertTransition(from, to);
  const [row] = await db
    .update(lobbies)
    .set({ status: to, updatedAt: now })
    .where(and(eq(lobbies.id, id), eq(lobbies.status, from)))
    .returning();
  if (!row) throw new AppError('INVALID_SESSION_STATE');
  return row;
}
export async function abortInterruptedMatches(db: Database, now: Date) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(lobbies)
      .where(inArray(lobbies.status, ['STARTING', 'IN_MATCH']))
      .for('update');
    for (const row of rows) {
      if (row.sessionId)
        await tx
          .update(gameSessions)
          .set({ status: 'CANCELLED', endedAt: now })
          .where(
            and(
              eq(gameSessions.id, row.sessionId),
              inArray(gameSessions.status, ['CREATED', 'ACTIVE']),
            ),
          );
      await tx
        .update(lobbies)
        .set({ status: row.status === 'IN_MATCH' ? 'CLOSED' : 'CANCELLED', updatedAt: now })
        .where(eq(lobbies.id, row.id));
    }
  });
}
