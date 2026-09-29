import { z } from 'zod';
import { anonymizeUser } from '@learnarena/db';
import { requireSessionUser } from '@/lib/auth/session';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
import { deleteAuthUser } from '@/lib/privacy/authDeletion';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
export const POST = route(
  { name: 'POST /api/me/delete', schema: z.object({ confirmation: z.literal('DELETE') }) },
  async ({ request, requestId }) => {
    const user = await requireSessionUser(request);
    const at = now(request);
    await anonymizeUser(db(), user.id, at);
    let authDeletionPending = false;
    try {
      await deleteAuthUser(user.id, at);
    } catch {
      authDeletionPending = true;
      logger.warn({ user_id: user.id }, 'privacy.auth_deletion_pending');
    }
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
    return ok({ deleted: true, authDeletionPending }, requestId);
  },
);
