import { z } from 'zod';
import { lobbyView, matchResults } from '@learnarena/db';
import { eq } from 'drizzle-orm';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const GET = route(
  {
    name: 'GET /api/lobbies/:code',
    params: z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/) }),
  },
  async ({ request, requestId, params }) => {
    const { user } = await requireOnboarded(request);
    const lobby = await lobbyView(db(), params.code, user.id, now(request));
    const [result] = lobby.sessionId
      ? await db().select().from(matchResults).where(eq(matchResults.sessionId, lobby.sessionId))
      : [];
    return ok(
      {
        ...lobby,
        result: result
          ? (result.resultJson as { players: { userId: string }[] }).players.find(
              (p) => p.userId === user.id,
            )
          : null,
      },
      requestId,
    );
  },
);
