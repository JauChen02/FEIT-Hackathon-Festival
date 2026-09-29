import '@learnarena/db/loadEnv';
import { Inngest } from 'inngest';
import { systemClock } from '@learnarena/core';
import { getDatabase } from '@learnarena/db';
import { createRealtimeServer } from './server';
const handle = getDatabase();
const inngest = new Inngest({ id: 'learnarena' });
const server = await createRealtimeServer({
  db: handle.db,
  clock: systemClock,
  origin: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  onComplete: async (sessionId, userId) => {
    if (process.env.BACKGROUND_JOB_MODE === 'worker') return;
    await inngest.send({
      id: `session-terminal:${sessionId}:${userId}`,
      name: 'session/terminal',
      data: { sessionId, userId },
    });
  },
});
server.http.listen(Number(process.env.PORT ?? 3001), '0.0.0.0', () =>
  console.info(JSON.stringify({ event: 'realtime.started' })),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server
      .close()
      .then(() => handle.close())
      .then(() => process.exit(0));
  });
