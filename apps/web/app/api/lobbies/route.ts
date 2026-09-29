import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createLobby } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { rateLimit } from '@/lib/security/rateLimit';
export const POST = route(
  {
    name: 'POST /api/lobbies',
    schema: z.object({ gameType: z.enum(['quiz_coop', 'team_deathmatch']) }),
  },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await rateLimit(user.id, 'lobby');
    const lobby = await db().transaction((tx) =>
      createLobby(
        tx,
        user.id,
        body.gameType,
        Array.from(randomBytes(8), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''),
        now(request),
      ),
    );
    return ok({ code: lobby.code }, requestId);
  },
);
