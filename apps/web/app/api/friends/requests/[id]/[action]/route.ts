import { z } from 'zod';
import { changeFriendRequest } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const POST = route(
  {
    name: 'POST /api/friends/requests/:id/:action',
    params: z.object({ id: z.uuid(), action: z.enum(['accept', 'decline', 'cancel']) }),
  },
  async ({ request, requestId, params }) => {
    const { user } = await requireOnboarded(request);
    return ok(
      await db().transaction((tx) =>
        changeFriendRequest(tx, user.id, params.id, params.action, now(request)),
      ),
      requestId,
    );
  },
);
