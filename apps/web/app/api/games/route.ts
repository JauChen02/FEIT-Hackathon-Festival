import { listActivities } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const GET = route({ name: 'GET /api/games' }, async ({ request, requestId }) => {
  await requireOnboarded(request);
  return ok({ activities: await listActivities(db()) }, requestId);
});
