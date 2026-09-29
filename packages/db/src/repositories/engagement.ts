import { and, eq, lt, lte, gt, sql } from 'drizzle-orm';
import { AppError, uuidv7 } from '@learnarena/core';
import type { Database } from '../client';
import { eventMultipliers } from '../schema';
import { requireRole, loadRoles, auditAdmin } from './admin';
export async function activeEventMultiplier(db: Database, at: Date) {
  const [event] = await db
    .select()
    .from(eventMultipliers)
    .where(and(lte(eventMultipliers.startsAt, at), gt(eventMultipliers.endsAt, at)));
  return event ? { id: event.id, name: event.name, multiplier: Number(event.multiplier) } : null;
}
export async function createEventMultiplier(
  db: Database,
  userId: string,
  input: { name: string; multiplier: number; startsAt: Date; endsAt: Date },
  at: Date,
) {
  requireRole(await loadRoles(db, userId), ['ADMIN']);
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('event-multiplier-windows'))`);
  const overlapping = await db
    .select()
    .from(eventMultipliers)
    .where(
      and(lt(eventMultipliers.startsAt, input.endsAt), gt(eventMultipliers.endsAt, input.startsAt)),
    );
  if (overlapping.length)
    throw new AppError('INVALID_INPUT', { message: 'Event windows cannot overlap.' });
  const [row] = await db
    .insert(eventMultipliers)
    .values({
      id: uuidv7(),
      name: input.name,
      multiplier: String(input.multiplier),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: userId,
      createdAt: at,
    })
    .returning();
  await auditAdmin(db, userId, 'event.create', row!.id, null, row, at, 'event_multiplier');
  return row!;
}
export async function listEventMultipliers(db: Database) {
  return db.select().from(eventMultipliers).orderBy(eventMultipliers.startsAt);
}
export async function hasEvent(db: Database, id: string) {
  return (await db.select().from(eventMultipliers).where(eq(eventMultipliers.id, id))).length > 0;
}
