import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import { realtimeSchemas, type Clock } from '@learnarena/core';
import {
  abortInterruptedMatches,
  lobbies,
  lobbyMembers,
  lobbyView,
  signRealtimeToken,
  transitionLobby,
  verifyRealtimeToken,
  type Database,
  type RealtimeClaims,
} from '@learnarena/db';
import type { MatchEngine } from './engine';
import { abortMatch, finalizeMatch, startMatch } from './persistence';
interface Room {
  lobbyId: string;
  code: string;
  ready: Set<string>;
  status: string;
  countdown: number | null;
  engine: MatchEngine | null;
  busy: boolean;
  lastActive: number;
}
export async function createRealtimeServer(options: {
  db: Database;
  clock: Clock;
  origin: string;
  onComplete?: (sessionId: string, userId: string) => Promise<void>;
}) {
  const { db, clock } = options;
  await abortInterruptedMatches(db, clock.now());
  const http = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'realtime' }));
  });
  const io = new Server(http, {
    cors: { origin: options.origin, credentials: true },
    maxHttpBufferSize: 16384,
  });
  let closing = false;
  const pending = new Set<Promise<unknown>>();
  function track(p: Promise<unknown>) {
    pending.add(p);
    void p.catch(() => {}).finally(() => pending.delete(p));
  }
  const rooms = new Map<string, Room>();
  const activeSockets = new Map<string, Socket>();
  const controlAcks = new Map<
    string,
    { clientEventId: string; accepted: boolean; reason?: string }
  >();
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown };
      if (typeof auth.token !== 'string') throw new Error('Unauthorized');
      const claims = verifyRealtimeToken(auth.token, clock.now());
      const [lobby] = await db.select().from(lobbies).where(eq(lobbies.id, claims.lobbyId));
      if (!lobby) throw new Error('Forbidden');
      await lobbyView(db, lobby.code, claims.userId, clock.now());
      const room = rooms.get(lobby.id);
      if (claims.kind === 'reconnect') {
        if (
          !room?.engine ||
          room.engine.id !== claims.matchId ||
          !room.engine.reconnect(claims.userId, clock.now().getTime())
        )
          throw new Error('Reconnect expired');
      } else if (lobby.status === 'IN_MATCH') throw new Error('Reconnect token required');
      else if (!['OPEN', 'STARTING'].includes(lobby.status)) throw new Error('Lobby closed');
      socket.data.claims = claims;
      socket.data.code = lobby.code;
      next();
    } catch {
      next(new Error('Unable to join this lobby.'));
    }
  });
  function state(room: Room) {
    if (closing) return;
    if (room.engine) {
      for (const player of room.engine.players) {
        const socket = activeSockets.get(`${room.lobbyId}:${player.userId}`);
        socket?.emit('state_snapshot', room.engine.snapshot(player.userId));
      }
    } else
      track(
        lobbyView(db, room.code, activeUser(room), clock.now())
          .then((view) =>
            io.to(room.lobbyId).emit('lobby_state', {
              code: room.code,
              gameType: view.gameType,
              status: room.status,
              members: view.members.map((m) => ({ ...m, ready: room.ready.has(m.userId) })),
              countdownAt: room.countdown,
            }),
          )
          .catch(() => {}),
      );
  }
  function activeUser(room: Room) {
    return (
      [...activeSockets.keys()].find((key) => key.startsWith(`${room.lobbyId}:`))?.split(':')[1] ??
      ''
    );
  }
  io.on('connection', (socket) => {
    const claims = socket.data.claims as RealtimeClaims;
    const key = `${claims.lobbyId}:${claims.userId}`;
    const previous = activeSockets.get(key);
    if (previous && previous.id !== socket.id) previous.disconnect(true);
    activeSockets.set(key, socket);
    void socket.join(claims.lobbyId);
    let room = rooms.get(claims.lobbyId);
    if (!room) {
      room = {
        lobbyId: claims.lobbyId,
        code: socket.data.code as string,
        ready: new Set(),
        status: 'OPEN',
        countdown: null,
        engine: null,
        busy: false,
        lastActive: clock.now().getTime(),
      };
      rooms.set(room.lobbyId, room);
    }
    const current = room;
    let windowAt = clock.now().getTime(),
      events = 0;
    function allowed() {
      const at = clock.now().getTime();
      if (at - windowAt >= 1000) {
        windowAt = at;
        events = 0;
      }
      return ++events <= 10;
    }
    if (current.engine) {
      socket.emit('match_start', {
        ...current.engine.snapshot(claims.userId),
        reconnectToken: signRealtimeToken({
          userId: claims.userId,
          lobbyId: claims.lobbyId,
          matchId: current.engine.id,
          kind: 'reconnect',
          exp: clock.now().getTime() + 3600000,
        }),
      });
    }
    state(current);
    for (const eventName of ['ready', 'leave', 'vote', 'submit_answer'] as const)
      socket.on(eventName, async (payload: unknown) => {
        if (!allowed()) {
          socket.emit('answer_ack', { accepted: false, reason: 'RATE_LIMITED' });
          return;
        }
        const parsed = realtimeSchemas[eventName].safeParse(payload);
        if (!parsed.success) {
          socket.emit('answer_ack', { accepted: false, reason: 'INVALID_INPUT' });
          return;
        }
        const event = parsed.data;
        current.lastActive = clock.now().getTime();
        if (eventName === 'vote' || eventName === 'submit_answer') {
          socket.emit(
            'answer_ack',
            current.engine?.submit(claims.userId, eventName, event, clock.now().getTime()) ?? {
              clientEventId: event.clientEventId,
              accepted: false,
              reason: 'INVALID_SESSION_STATE',
            },
          );
          return;
        }
        const ackKey = `${key}:${event.clientEventId}`;
        const previousAck = controlAcks.get(ackKey);
        if (previousAck) {
          socket.emit('answer_ack', previousAck);
          return;
        }
        const ack = { clientEventId: event.clientEventId, accepted: false };
        controlAcks.set(ackKey, ack);
        try {
          if (eventName === 'ready' && 'isReady' in event && !current.engine && !current.busy) {
            if (event.isReady) current.ready.add(claims.userId);
            else current.ready.delete(claims.userId);
            ack.accepted = true;
          } else if (eventName === 'leave') {
            if (current.engine) {
              current.engine.disconnect(claims.userId, clock.now().getTime() - 30001);
              current.engine.expireDisconnected(clock.now().getTime());
            } else {
              current.ready.delete(claims.userId);
              await db.transaction(async (tx) => {
                const [lobby] = await tx
                  .select()
                  .from(lobbies)
                  .where(eq(lobbies.id, current.lobbyId))
                  .for('update');
                if (
                  lobby?.hostId === claims.userId &&
                  ['OPEN', 'STARTING'].includes(lobby.status)
                ) {
                  await transitionLobby(tx, lobby.id, lobby.status, 'CANCELLED', clock.now());
                  current.status = 'CANCELLED';
                }
                await tx
                  .delete(lobbyMembers)
                  .where(
                    and(
                      eq(lobbyMembers.lobbyId, current.lobbyId),
                      eq(lobbyMembers.userId, claims.userId),
                    ),
                  );
              });
            }
            ack.accepted = true;
            socket.emit('answer_ack', ack);
            socket.disconnect(true);
          }
          socket.emit('answer_ack', ack);
          state(current);
        } catch {
          socket.emit('answer_ack', { ...ack, accepted: false, reason: 'FORBIDDEN' });
        }
      });
    socket.on('disconnect', () => {
      if (activeSockets.get(key)?.id !== socket.id) return;
      activeSockets.delete(key);
      current.ready.delete(claims.userId);
      current.engine?.disconnect(claims.userId, clock.now().getTime());
      state(current);
    });
  });
  async function tick() {
    if (closing) return;
    for (const room of rooms.values()) {
      if (room.busy) continue;
      room.busy = true;
      try {
        const at = clock.now();
        const time = at.getTime();
        const engine = room.engine;
        if (!engine && ['OPEN', 'STARTING'].includes(room.status)) {
          const userId = activeUser(room);
          if (!userId) {
            if (time - room.lastActive >= 900000) {
              await db
                .update(lobbies)
                .set({
                  status: room.status === 'STARTING' ? 'CANCELLED' : 'EXPIRED',
                  updatedAt: at,
                })
                .where(eq(lobbies.id, room.lobbyId));
              rooms.delete(room.lobbyId);
            }
            continue;
          }
          const view = await lobbyView(db, room.code, userId, at);
          const count = view.members.length;
          const valid =
            count >= (view.gameType === 'quiz_coop' ? 2 : 4) &&
            (view.gameType !== 'team_deathmatch' || count % 2 === 0) &&
            view.members.every(
              (m) => room.ready.has(m.userId) && activeSockets.has(`${room.lobbyId}:${m.userId}`),
            );
          if (view.status === 'EXPIRED') {
            room.status = 'EXPIRED';
            state(room);
            continue;
          }
          if (valid && room.status === 'OPEN') {
            await transitionLobby(db, room.lobbyId, 'OPEN', 'STARTING', at);
            room.status = 'STARTING';
            room.countdown = time + 5000;
            state(room);
          } else if (!valid && room.status === 'STARTING') {
            await transitionLobby(db, room.lobbyId, 'STARTING', 'OPEN', at);
            room.status = 'OPEN';
            room.countdown = null;
            state(room);
          } else if (
            valid &&
            room.status === 'STARTING' &&
            room.countdown !== null &&
            time >= room.countdown
          ) {
            room.engine = await startMatch(db, room.lobbyId, at);
            room.status = 'IN_MATCH';
            for (const player of room.engine.players)
              activeSockets.get(`${room.lobbyId}:${player.userId}`)?.emit('match_start', {
                ...room.engine.snapshot(player.userId),
                reconnectToken: signRealtimeToken({
                  userId: player.userId,
                  lobbyId: room.lobbyId,
                  matchId: room.engine.id,
                  kind: 'reconnect',
                  exp: time + 3600000,
                }),
              });
            state(room);
          }
        } else if (engine) {
          engine.expireDisconnected(time);
          if (engine.shouldResolve(time)) {
            const result = engine.resolve(time);
            io.to(room.lobbyId).emit('round_result', result);
            state(room);
          }
          if (engine.status === 'ABORTED') {
            await abortMatch(db, room.lobbyId, engine.id, at);
            io.to(room.lobbyId).emit('match_end', {
              outcome: 'ABORTED',
              finalPoints: 0,
              review: [],
            });
            rooms.delete(room.lobbyId);
          } else if (engine.status === 'FINALIZING') {
            let results: Awaited<ReturnType<typeof finalizeMatch>> | undefined;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                results = await finalizeMatch(db, room.lobbyId, engine, at);
                break;
              } catch {
                console.error(
                  JSON.stringify({
                    event: 'match.finalize_failed',
                    session_id: engine.id,
                    attempt,
                  }),
                );
              }
            }
            if (!results) {
              engine.transition('ABORTED');
              await abortMatch(db, room.lobbyId, engine.id, at);
              io.to(room.lobbyId).emit('match_end', {
                outcome: 'ABORTED',
                finalPoints: 0,
                review: [],
              });
            } else {
              engine.transition('FINISHED');
              for (const result of results) {
                activeSockets.get(`${room.lobbyId}:${result.userId}`)?.emit('match_end', result);
                try {
                  await options.onComplete?.(engine.id, result.userId);
                } catch {
                  console.error(
                    JSON.stringify({
                      event: 'session.terminal_event_send_failed',
                      session_id: engine.id,
                    }),
                  );
                }
              }
              room.lastActive = time;
            }
          } else if (engine.status === 'FINISHED' && time - room.lastActive > 60000)
            rooms.delete(room.lobbyId);
        }
      } catch {
        console.error(JSON.stringify({ event: 'match.error', lobby_id: room.lobbyId }));
        if (room.engine && room.engine.status !== 'FINISHED') {
          room.engine.status = 'ABORTED';
          await abortMatch(db, room.lobbyId, room.engine.id, clock.now()).catch(() => {});
          io.to(room.lobbyId).emit('match_end', { outcome: 'ABORTED', finalPoints: 0, review: [] });
          rooms.delete(room.lobbyId);
        }
      } finally {
        room.busy = false;
      }
    }
  }
  const timer = setInterval(() => track(tick()), 200);
  return {
    http,
    io,
    rooms,
    tick,
    close: async () => {
      closing = true;
      clearInterval(timer);
      await Promise.allSettled([...pending]);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
