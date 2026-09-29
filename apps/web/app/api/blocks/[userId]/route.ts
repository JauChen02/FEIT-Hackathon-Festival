import { z } from 'zod';
import { unblockUser } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const DELETE = route(
  { name: 'DELETE /api/blocks/:userId', params: z.object({ userId: z.uuid() }) },
  async ({ request, requestId, params }) => {
    const { user } = await requireOnboarded(request);
    await db().transaction((tx) => unblockUser(tx, user.id, params.userId));
    return ok({ unblocked: true }, requestId);
  },
);
