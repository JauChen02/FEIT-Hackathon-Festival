import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createFriendInvite, redeemFriendInvite } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { rateLimit } from '@/lib/security/rateLimit';
export const POST = route(
  { name: 'POST /api/invites', schema: z.object({ code: z.string().min(20).max(64).optional() }) },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await rateLimit(user.id, 'friend');
    return ok(
      await db().transaction(async (tx) =>
        body.code
          ? redeemFriendInvite(tx, user.id, body.code, now(request))
          : createFriendInvite(tx, user.id, randomBytes(24).toString('base64url'), now(request)),
      ),
      requestId,
    );
  },
);
