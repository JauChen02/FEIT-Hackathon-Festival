import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { notificationPreferences } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
export const GET = route({ name: 'GET /api/me/preferences' }, async ({ request, requestId }) => {
  const { user } = await requireOnboarded(request);
  const [row] = await db()
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.id));
  return ok(
    row ?? { pushEnabled: false, quietStart: 21, quietEnd: 8, dailyGoal: 1, breakReminder: true },
    requestId,
  );
});
const schema = z
  .object({
    pushEnabled: z.boolean(),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
    dailyGoal: z.number().int().min(1).max(20),
    breakReminder: z.boolean(),
  })
  .strict();
export const PATCH = route(
  { name: 'PATCH /api/me/preferences', schema },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await db()
      .insert(notificationPreferences)
      .values({ userId: user.id, ...body, updatedAt: now(request) })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { ...body, updatedAt: now(request) },
      });
    return ok(body, requestId);
  },
);
