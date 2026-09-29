import { adminActivityRequest } from '@learnarena/core';
import { listAdminActivities, mutateAdminActivity } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const GET = route({ name: 'GET /api/admin/activities' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  return ok(
    await db().transaction((tx) => listAdminActivities(tx, user.id, now(request))),
    requestId,
  );
});
export const POST = route(
  { name: 'POST /api/admin/activities', schema: adminActivityRequest },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    return ok(
      await db().transaction((tx) => mutateAdminActivity(tx, user.id, body, now(request))),
      requestId,
    );
  },
);
