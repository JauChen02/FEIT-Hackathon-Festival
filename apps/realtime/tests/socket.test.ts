import { afterAll, beforeAll, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { FixedClock, uuidv7 } from '@learnarena/core';
import { createLobby, joinLobby, signRealtimeToken, users } from '@learnarena/db';
import { createTestDatabase, type TestDatabase } from '../../../packages/db/tests/helpers/database';
import { createRealtimeServer } from '../src/server';
let ctx: TestDatabase;
let server: Awaited<ReturnType<typeof createRealtimeServer>>;
const clock = new FixedClock('2026-09-30T12:00:00Z');
const ids = [uuidv7(), uuidv7(), uuidv7()];
let lobbyId: string;
let url: string;
const clients: Socket[] = [];
beforeAll(async () => {
  process.env.REALTIME_TOKEN_SECRET = 'test-only-socket-secret-longer-than-32-characters';
  ctx = await createTestDatabase('socket');
  for (let i = 0; i < ids.length; i++)
    await ctx.db
      .insert(users)
      .values({
        id: ids[i]!,
        username: `socket_user_${i}`,
        displayName: `Player ${i}`,
        timezone: 'UTC',
        onboardingCompletedAt: clock.now(),
      });
  const lobby = await ctx.db.transaction((tx) =>
    createLobby(tx, ids[0]!, 'quiz_coop', 'ABABAB123456', clock.now()),
  );
  lobbyId = lobby.id;
  await ctx.db.transaction((tx) => joinLobby(tx, lobby.code, ids[1]!, clock.now()));
  server = await createRealtimeServer({ db: ctx.db, clock, origin: 'http://localhost:3000' });
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', r));
  const address = server.http.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(async () => {
  for (const client of clients) client.disconnect();
  await server?.close();
  await ctx?.drop();
});
function client(userId: string, token?: string) {
  const socket = io(url, {
    auth: {
      token:
        token ??
        signRealtimeToken({
          userId,
          lobbyId,
          kind: 'handshake',
          exp: clock.now().getTime() + 120000,
        }),
    },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  });
  clients.push(socket);
  return socket;
}
it('rejects unauthorized membership and tampered tokens', async () => {
  for (const socket of [client(ids[2]!), client(ids[0]!, 'tampered')]) {
    const failed = new Promise<string>((resolve) =>
      socket.once('connect_error', (error) => resolve(error.message)),
    );
    socket.connect();
    expect(await failed).toBe('Unable to join this lobby.');
  }
});
it('validates and deduplicates readiness events over an actual socket', async () => {
  const socket = client(ids[0]!);
  const connected = new Promise<void>((resolve) => socket.once('connect', resolve));
  socket.connect();
  await connected;
  const event = { clientEventId: uuidv7(), isReady: true };
  const ack = () =>
    new Promise<{ accepted: boolean; clientEventId: string }>((resolve) =>
      socket.once('answer_ack', resolve),
    );
  const first = ack();
  socket.emit('ready', event);
  expect((await first).accepted).toBe(true);
  const repeated = ack();
  socket.emit('ready', { ...event, isReady: false });
  expect((await repeated).accepted).toBe(true);
  expect(server.rooms.get(lobbyId)!.ready.has(ids[0]!)).toBe(true);
  const malformed = ack();
  socket.emit('ready', { isReady: true });
  expect((await malformed).accepted).toBe(false);
});
