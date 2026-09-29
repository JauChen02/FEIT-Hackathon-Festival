import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { acceptedFriendIds, activityEvents, users } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const GET = route({ name: 'GET /api/feed' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  const ids = await acceptedFriendIds(db(), user.id);
  const events = ids.length
    ? await db()
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          displayName: users.displayName,
          message: activityEvents.message,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .innerJoin(users, eq(users.id, activityEvents.actorId))
        .where(and(inArray(activityEvents.actorId, ids), isNull(users.deletedAt)))
        .orderBy(desc(activityEvents.createdAt))
        .limit(50)
    : [];
  return ok({ events }, requestId);
});
