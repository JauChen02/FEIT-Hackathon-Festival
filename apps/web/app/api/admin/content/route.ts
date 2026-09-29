import { adminContentRequestSchema } from '@learnarena/core';
import { listAdminContent, mutateAdminContent } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const GET = route({ name: 'GET /api/admin/content' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  return ok(await listAdminContent(db(), user.id, now(request)), requestId);
});
export const POST = route(
  { name: 'POST /api/admin/content', schema: adminContentRequestSchema },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    return ok(
      await db().transaction((tx) => mutateAdminContent(tx, user.id, body, now(request))),
      requestId,
    );
  },
);
