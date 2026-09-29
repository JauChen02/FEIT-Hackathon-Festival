import { listFriends } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
export const GET = route({ name: 'GET /api/friends' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  return ok(await listFriends(db(), user.id), requestId);
});
