import { exportUserData } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const POST = route({ name: 'POST /api/me/export' }, async ({ request }) => {
  const { user } = await requireOnboarded(request);
  return new Response(JSON.stringify(await exportUserData(db(), user.id, now(request)), null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename="learnarena-export.json"',
      'cache-control': 'no-store',
    },
  });
});
