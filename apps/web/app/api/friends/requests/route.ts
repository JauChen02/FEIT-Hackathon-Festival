import { z } from 'zod';
import { usernameSchema } from '@learnarena/core';
import { requestFriend } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { rateLimit } from '@/lib/security/rateLimit';
export const POST = route(
  { name: 'POST /api/friends/requests', schema: z.object({ username: usernameSchema }) },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await rateLimit(user.id, 'friend');
    return ok(
      await db().transaction((tx) => requestFriend(tx, user.id, body.username, now(request))),
      requestId,
    );
  },
);
