/**
 * Coach repository (PLANNING.md §11).
 *
 * §11.1: "Only `learning_events`." This module is the **only** place the Coach
 * reads assessment history from, and it reads nothing but `learning_events`,
 * `skill_profiles` and `skill_updates`. It never touches `answers`,
 * `game_sessions` or any other game-specific table, which is what keeps
 * Invariant 9 true as new game types arrive.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7, type EloApplication } from '@learnarena/core';
import type { Database } from '../client';
import { categories, learningEvents, skillProfiles, skillUpdates } from '../schema/index';

// ---------------------------------------------------------------------------
// Signals (§11.4 inputs)
// ---------------------------------------------------------------------------

export interface CategoryExposure {
  categoryId: string;
  /** Events inside the exposure window (§11.4: last 60 days). */
  exposureCount: number;
  /** Most recent event of any age, or null when the category was never played. */
  lastEventAt: Date | null;
  /** All-time event count, for display. */
  lifetimeEventCount: number;
}

/**
 * Per-category exposure, recency and lifetime counts for one learner.
 *
 * One grouped query rather than three per category: §11.4 needs all of it for
 * every launch category on every Skills page load and every recommendation.
 */
export async function loadCategoryExposure(
  db: Database,
  userId: string,
  windowStart: Date,
): Promise<Map<string, CategoryExposure>> {
  const rows = await db
    .select({
      categoryId: learningEvents.categoryId,
      // The window bound is interpolated as an explicit timestamptz: a raw
      // `sql` template binds parameters itself and does not get the column
      // type coercion that a Drizzle comparison would apply to a Date.
      exposureCount: sql<number>`count(*) filter (where ${learningEvents.occurredAt} >= ${windowStart.toISOString()}::timestamptz)::int`,
      lifetimeEventCount: sql<number>`count(*)::int`,
      lastEventAt: sql<Date | null>`max(${learningEvents.occurredAt})`,
    })
    .from(learningEvents)
    .where(eq(learningEvents.userId, userId))
    .groupBy(learningEvents.categoryId);

  return new Map(
    rows.map((row) => [
      row.categoryId,
      {
        categoryId: row.categoryId,
        exposureCount: row.exposureCount,
        lifetimeEventCount: row.lifetimeEventCount,
        lastEventAt: row.lastEventAt ? new Date(row.lastEventAt) : null,
      },
    ]),
  );
}

// ---------------------------------------------------------------------------
// skill_profiles (§14.2)
// ---------------------------------------------------------------------------

export interface SkillProfileRecord {
  userId: string;
  categoryId: string;
  rating: number;
  lifetimeEventCount: number;
  lastEventAt: Date | null;
}

export async function loadSkillProfiles(
  db: Database,
  userId: string,
): Promise<Map<string, SkillProfileRecord>> {
  const rows = await db.select().from(skillProfiles).where(eq(skillProfiles.userId, userId));

  return new Map(
    rows.map((row) => [
      row.categoryId,
      {
        userId: row.userId,
        categoryId: row.categoryId,
        rating: Number(row.rating),
        lifetimeEventCount: row.lifetimeEventCount,
        lastEventAt: row.lastEventAt,
      },
    ]),
  );
}

/** One category's canonical rating, or null when the learner has no profile yet. */
export async function findSkillProfile(
  db: Database,
  userId: string,
  categoryId: string,
): Promise<SkillProfileRecord | undefined> {
  const rows = await db
    .select()
    .from(skillProfiles)
    .where(and(eq(skillProfiles.userId, userId), eq(skillProfiles.categoryId, categoryId)))
    .limit(1);

  const row = rows[0];
  return row
    ? {
        userId: row.userId,
        categoryId: row.categoryId,
        rating: Number(row.rating),
        lifetimeEventCount: row.lifetimeEventCount,
        lastEventAt: row.lastEventAt,
      }
    : undefined;
}

/**
 * Write the profile after a run of Elo updates.
 *
 * `rating` is set absolutely rather than incremented: it is the last
 * `rating_after` from the chain, so re-deriving it from `skill_updates` always
 * gives the same answer (Invariant 5).
 */
export async function upsertSkillProfile(
  tx: Database,
  input: {
    userId: string;
    categoryId: string;
    rating: number;
    lifetimeEventCount: number;
    lastEventAt: Date;
    now: Date;
  },
): Promise<void> {
  await tx
    .insert(skillProfiles)
    .values({
      userId: input.userId,
      categoryId: input.categoryId,
      rating: input.rating.toFixed(2),
      lifetimeEventCount: input.lifetimeEventCount,
      lastEventAt: input.lastEventAt,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [skillProfiles.userId, skillProfiles.categoryId],
      set: {
        rating: input.rating.toFixed(2),
        lifetimeEventCount: input.lifetimeEventCount,
        lastEventAt: input.lastEventAt,
        updatedAt: input.now,
      },
    });
}

// ---------------------------------------------------------------------------
// learning_events and skill_updates (§11.3)
// ---------------------------------------------------------------------------

export interface UnprocessedEvent {
  id: string;
  categoryId: string;
  difficultyRating: number;
  correctness: number;
  occurredAt: Date;
}

/**
 * A session's learning events that have no `skill_updates` row yet, in
 * `occurred_at` order, ties by id (§11.3).
 *
 * The LEFT JOIN is the idempotency guard in query form: an event already
 * applied is simply not returned, so re-running the job is a no-op without
 * needing to remember that it ran (§18.1).
 */
export async function listUnprocessedEvents(
  db: Database,
  sessionId: string,
  userId?: string,
): Promise<UnprocessedEvent[]> {
  const rows = await db
    .select({
      id: learningEvents.id,
      categoryId: learningEvents.categoryId,
      difficultyRating: learningEvents.difficultyRating,
      correctness: learningEvents.correctness,
      occurredAt: learningEvents.occurredAt,
    })
    .from(learningEvents)
    .leftJoin(skillUpdates, eq(skillUpdates.learningEventId, learningEvents.id))
    .where(
      and(
        eq(learningEvents.sessionId, sessionId),
        isNull(skillUpdates.id),
        userId ? eq(learningEvents.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(learningEvents.occurredAt), asc(learningEvents.id));

  return rows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    difficultyRating: Number(row.difficultyRating),
    correctness: Number(row.correctness),
    occurredAt: row.occurredAt,
  }));
}

/**
 * Record one Elo application.
 *
 * `learning_event_id` is UNIQUE, so a concurrent duplicate loses at the
 * database rather than racing a read (§18.1). Returns false when that happens.
 */
export async function insertSkillUpdate(
  tx: Database,
  input: {
    learningEventId: string;
    userId: string;
    categoryId: string;
    application: EloApplication;
    now: Date;
  },
): Promise<boolean> {
  const inserted = await tx
    .insert(skillUpdates)
    .values({
      id: uuidv7(),
      learningEventId: input.learningEventId,
      userId: input.userId,
      categoryId: input.categoryId,
      ratingBefore: input.application.ratingBefore.toFixed(2),
      ratingAfter: input.application.ratingAfter.toFixed(2),
      // numeric(6,5) — the expected score is always 0..1.
      expected: input.application.expected.toFixed(5),
      kFactor: input.application.kFactor,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: skillUpdates.learningEventId })
    .returning({ id: skillUpdates.id });

  return inserted.length > 0;
}

// ---------------------------------------------------------------------------
// Skill deltas and history (§20 screens 6 and 7)
// ---------------------------------------------------------------------------

export interface SessionSkillMovement {
  categoryId: string;
  ratingBefore: number;
  ratingAfter: number;
  eventCount: number;
}

/**
 * How one session moved the learner's rating, per category.
 *
 * Joined through `learning_events` because `skill_updates` has no session
 * column — the event is the link, which is exactly the §9 contract.
 */
export async function loadSessionSkillMovements(
  db: Database,
  sessionId: string,
): Promise<SessionSkillMovement[]> {
  const rows = await db
    .select({
      categoryId: skillUpdates.categoryId,
      ratingBefore: skillUpdates.ratingBefore,
      ratingAfter: skillUpdates.ratingAfter,
      createdAt: skillUpdates.createdAt,
      eventOccurredAt: learningEvents.occurredAt,
      eventId: learningEvents.id,
    })
    .from(skillUpdates)
    .innerJoin(learningEvents, eq(learningEvents.id, skillUpdates.learningEventId))
    .where(eq(learningEvents.sessionId, sessionId))
    .orderBy(asc(learningEvents.occurredAt), asc(learningEvents.id));

  const byCategory = new Map<string, SessionSkillMovement>();
  for (const row of rows) {
    const existing = byCategory.get(row.categoryId);
    if (existing) {
      // Rows arrive in application order, so the last one carries the final rating.
      existing.ratingAfter = Number(row.ratingAfter);
      existing.eventCount += 1;
    } else {
      byCategory.set(row.categoryId, {
        categoryId: row.categoryId,
        ratingBefore: Number(row.ratingBefore),
        ratingAfter: Number(row.ratingAfter),
        eventCount: 1,
      });
    }
  }

  return [...byCategory.values()];
}

export interface RatingHistoryRow {
  categoryId: string;
  at: Date;
  ratingAfter: number;
}

/** Recent rating movements per category, for the §20 screen 7 chart. */
export async function loadRatingHistory(
  db: Database,
  userId: string,
  categoryIds: readonly string[],
  limitPerCategory = 30,
): Promise<RatingHistoryRow[]> {
  if (categoryIds.length === 0) return [];

  // One window query rather than N round trips.
  const ranked = db
    .select({
      categoryId: skillUpdates.categoryId,
      createdAt: skillUpdates.createdAt,
      ratingAfter: skillUpdates.ratingAfter,
      position:
        sql<number>`row_number() over (partition by ${skillUpdates.categoryId} order by ${skillUpdates.createdAt} desc, ${skillUpdates.id} desc)`.as(
          'position',
        ),
    })
    .from(skillUpdates)
    .where(and(eq(skillUpdates.userId, userId), inArray(skillUpdates.categoryId, [...categoryIds])))
    .as('ranked');

  const rows = await db
    .select({
      categoryId: ranked.categoryId,
      at: ranked.createdAt,
      ratingAfter: ranked.ratingAfter,
    })
    .from(ranked)
    .where(sql`${ranked.position} <= ${limitPerCategory}`)
    .orderBy(asc(ranked.createdAt));

  return rows.map((row) => ({
    categoryId: row.categoryId,
    at: row.at,
    ratingAfter: Number(row.ratingAfter),
  }));
}

// ---------------------------------------------------------------------------
// Backfill support (ADR-051)
// ---------------------------------------------------------------------------

/**
 * Terminal sessions whose learning events have no `skill_updates` rows.
 *
 * Phase 1 marked sessions post-processed with a stub job (ADR-043), so
 * sessions played before Phase 3 have events but no Elo history. This finds
 * them for `admin:backfill-skills`.
 */
export async function listSessionsMissingSkillUpdates(
  db: Database,
  limit = 500,
): Promise<{ sessionId: string; userId: string }[]> {
  const rows = await db
    .selectDistinct({
      sessionId: learningEvents.sessionId,
      userId: learningEvents.userId,
    })
    .from(learningEvents)
    .leftJoin(skillUpdates, eq(skillUpdates.learningEventId, learningEvents.id))
    .where(isNull(skillUpdates.id))
    .limit(limit);

  return rows;
}

/** Launch categories, in slug order — the axes of the Skills radar. */
export async function listLaunchCategoryRows(db: Database) {
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(inArray(categories.status, ['LAUNCH', 'ACTIVE']))
    .orderBy(asc(categories.slug));
}

export { desc };
