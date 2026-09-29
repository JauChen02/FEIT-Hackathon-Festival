import { z } from 'zod';
import { blockUser } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const POST = route(
  { name: 'POST /api/blocks', schema: z.object({ userId: z.uuid() }) },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await db().transaction((tx) => blockUser(tx, user.id, body.userId, now(request)));
    return ok({ blocked: true }, requestId);
  },
);
