import { z } from 'zod';
import { removeFriend } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const DELETE = route(
  { name: 'DELETE /api/friends/:userId', params: z.object({ userId: z.uuid() }) },
  async ({ request, requestId, params }) => {
    const { user } = await requireOnboarded(request);
    await db().transaction((tx) => removeFriend(tx, user.id, params.userId, now(request)));
    return ok({ removed: true }, requestId);
  },
);
