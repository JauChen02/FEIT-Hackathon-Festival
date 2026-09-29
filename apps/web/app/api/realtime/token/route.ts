import { z } from 'zod';
import { AppError } from '@learnarena/core';
import { lobbyView, signRealtimeToken } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const POST = route(
  {
    name: 'POST /api/realtime/token',
    schema: z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/) }),
  },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    const at = now(request);
    const lobby = await lobbyView(db(), body.code, user.id, at);
    if (!['OPEN', 'STARTING', 'IN_MATCH'].includes(lobby.status))
      throw new AppError('INVALID_SESSION_STATE');
    return ok(
      {
        token: signRealtimeToken({
          userId: user.id,
          lobbyId: lobby.id,
          kind: 'handshake',
          exp: at.getTime() + 120000,
        }),
        url: process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3001',
        userId: user.id,
      },
      requestId,
    );
  },
);
