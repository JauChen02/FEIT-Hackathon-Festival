import 'server-only';
import webpush from 'web-push';
import { and, eq, isNull } from 'drizzle-orm';
import { isQuietHour, localDateFor, systemClock } from '@learnarena/core';
import {
  deletionRequests,
  notificationPreferences,
  notificationSendLog,
  pushSubscriptions,
  streakDays,
  users,
} from '@learnarena/db';
import { db } from '../../db';
import { deleteAuthUser } from '../../privacy/authDeletion';
import { logger } from '../../logger';
import { inngest } from '../client';
type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
async function deliver(subscription: Subscription) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error('Push not configured');
  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: 'A little practice?',
      body: 'Your next learning moment is ready when you are.',
    }),
    { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, timeout: 5000 },
  );
}
export async function runReminders(at: Date = systemClock.now(), send = deliver) {
  if (send === deliver && (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT))
    return { sent: 0 };
  const profiles = await db()
    .select({ user: users, preferences: notificationPreferences })
    .from(users)
    .innerJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(and(isNull(users.deletedAt), eq(notificationPreferences.pushEnabled, true)));
  let sent = 0;
  for (const { user, preferences } of profiles) {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: user.timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(at),
    );
    if (isQuietHour(hour, preferences.quietStart, preferences.quietEnd)) continue;
    const date = localDateFor(user.timezone, at);
    const [day] = await db()
      .select()
      .from(streakDays)
      .where(and(eq(streakDays.userId, user.id), eq(streakDays.localDate, date)));
    if (day) continue;
    const subscriptions = await db()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));
    if (!subscriptions.length) continue;
    // Reserve before sending: retries must never send twice after an ambiguous provider response.
    const [claim] = await db()
      .insert(notificationSendLog)
      .values({ userId: user.id, localDate: date, sentAt: at })
      .onConflictDoNothing()
      .returning();
    if (!claim) continue;
    const subscription = subscriptions[0]!;
    try {
      await send({
        endpoint: subscription.endpoint,
        keys: subscription.keysJson as Subscription['keys'],
      });
      sent++;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'statusCode' in error &&
        [404, 410].includes(Number(error.statusCode))
      )
        await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      logger.warn({ user_id: user.id }, 'notification.delivery_failed');
    }
  }
  return { sent };
}
export async function runAuthDeletionRetries(at: Date = systemClock.now()) {
  const pending = await db()
    .select()
    .from(deletionRequests)
    .where(isNull(deletionRequests.authDeletedAt));
  for (const row of pending) await deleteAuthUser(row.userId, at);
  return pending.length;
}
export const sendReminders = inngest.createFunction(
  { id: 'notifications-daily-reminder', retries: 5, triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => step.run('send', () => runReminders()),
);
export const retryAuthDeletion = inngest.createFunction(
  { id: 'privacy-delete-auth', retries: 5, triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => step.run('delete', () => runAuthDeletionRetries()),
);
export const privacyFunctions = [sendReminders, retryAuthDeletion];
