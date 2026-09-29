import { clientIpKey } from '@/lib/security/clientIp';
import { z } from 'zod';
import { joinLobby } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { rateLimit } from '@/lib/security/rateLimit';
export const POST = route(
  {
    name: 'POST /api/lobbies/:code/join',
    params: z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/) }),
  },
  async ({ request, requestId, params }) => {
    const { user } = await requireOnboarded(request);
    await rateLimit(user.id, 'lobby');
    await rateLimit(clientIpKey(request), 'lobby-ip');
    await db().transaction((tx) => joinLobby(tx, params.code, user.id, now(request)));
    return ok({ code: params.code }, requestId);
  },
);
