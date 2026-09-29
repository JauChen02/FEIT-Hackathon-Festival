import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, uuidv7 } from '@learnarena/core';
import { pushSubscriptions, notificationPreferences } from '@learnarena/db';
import { requireOnboarded } from '@/lib/auth/guards';
import { ok, route } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { now } from '@/lib/sessions/context';
// Fixed browser push-service hosts prevent arbitrary URL requests from the notification worker.
const allowed = (endpoint: string) => {
  const url = new URL(endpoint);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
      url.hostname,
    ) ||
      url.hostname.endsWith('.notify.windows.com'))
  );
};
const schema = z.object({
  endpoint: z.url().max(2048).refine(allowed, 'Unsupported push service'),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .min(80)
      .max(120),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .min(20)
      .max(32),
  }),
  consent: z.literal(true),
});
export const GET = route({ name: 'GET /api/push/subscribe' }, async ({ request, requestId }) => {
  await requireOnboarded(request);
  return ok({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }, requestId);
});
export const POST = route(
  { name: 'POST /api/push/subscribe', schema },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
      throw new AppError('INVALID_INPUT', {
        message: 'Notifications are not configured on this server.',
      });
    const at = now(request);
    await db().transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, body.endpoint));
      if (existing && existing.userId !== user.id) throw new AppError('FORBIDDEN');
      await tx
        .insert(pushSubscriptions)
        .values({
          id: uuidv7(),
          userId: user.id,
          endpoint: body.endpoint,
          keysJson: body.keys,
          createdAt: at,
        })
        .onConflictDoNothing();
      await tx
        .insert(notificationPreferences)
        .values({ userId: user.id, pushEnabled: true, updatedAt: at })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { pushEnabled: true, updatedAt: at },
        });
    });
    return ok({ subscribed: true }, requestId);
  },
);
export const DELETE = route(
  { name: 'DELETE /api/push/subscribe', schema: z.object({ endpoint: z.string().optional() }) },
  async ({ request, requestId, body }) => {
    const { user } = await requireOnboarded(request);
    await db().transaction(async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            body.endpoint ? eq(pushSubscriptions.endpoint, body.endpoint) : undefined,
          ),
        );
      await tx
        .update(notificationPreferences)
        .set({ pushEnabled: false, updatedAt: now(request) })
        .where(eq(notificationPreferences.userId, user.id));
    });
    return ok({ subscribed: false }, requestId);
  },
);
