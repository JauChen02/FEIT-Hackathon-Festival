import { z } from 'zod';
import {
  createEventMultiplier,
  listEventMultipliers,
  loadRoles,
  requireRole,
} from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
const schema = z
  .object({
    name: z.string().trim().min(3).max(80),
    multiplier: z.number().min(1).max(2).multipleOf(0.01),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .refine((v) => v.startsAt < v.endsAt, 'End must follow start');
export const GET = route({ name: 'GET /api/admin/events' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  requireRole(await loadRoles(db(), user.id), ['ADMIN']);
  return ok({ events: await listEventMultipliers(db()) }, requestId);
});
export const POST = route(
  { name: 'POST /api/admin/events', schema },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    return ok(
      await db().transaction((tx) =>
        createEventMultiplier(
          tx,
          user.id,
          { ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) },
          now(request),
        ),
      ),
      requestId,
    );
  },
);
