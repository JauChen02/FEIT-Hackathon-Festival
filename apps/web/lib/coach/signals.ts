import 'server-only';
import {
  EXPOSURE_WINDOW_DAYS,
  STARTING_USER_RATING,
  deriveAll,
  type CategorySignals,
  type DerivedSignals,
} from '@learnarena/core';
import {
  loadCategoryExposure,
  loadSkillProfiles,
  listLaunchCategoryRows,
  type Database,
} from '@learnarena/db';

/**
 * Assembling the Coach's inputs (PLANNING.md §11.1, §11.4).
 *
 * §11.1: "Only `learning_events`." Everything below reads the learner's event
 * history and their canonical ratings, then hands plain numbers to the pure
 * functions in `packages/core/coach`. No game-specific table is consulted, so
 * a new game type contributes to the Coach purely by emitting §9 events.
 */

export interface LaunchCategory {
  id: string;
  slug: string;
  name: string;
}

export interface CoachSignals {
  categories: LaunchCategory[];
  /** Derived values per category slug, computed at read time (Invariant 5). */
  derived: DerivedSignals[];
  bySlug: Map<string, DerivedSignals>;
  byId: Map<string, DerivedSignals>;
  categoryBySlug: Map<string, LaunchCategory>;
  categoryById: Map<string, LaunchCategory>;
  /** All-time event counts per category id, for display only. */
  lifetimeEventCounts: Map<string, number>;
}

/** Whole days between two instants, floored — §11.4's `recency_days`. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Build the full §11.4 picture for one learner.
 *
 * A category with no `skill_profiles` row uses the §11.3 starting rating of
 * 1000 and zero exposure, which is what makes a never-played category score
 * exactly 0.50.
 */
export async function loadCoachSignals(
  db: Database,
  userId: string,
  now: Date,
): Promise<CoachSignals> {
  const categoryRows = await listLaunchCategoryRows(db);
  const windowStart = new Date(now.getTime() - EXPOSURE_WINDOW_DAYS * 86_400_000);

  const [profiles, exposure] = await Promise.all([
    loadSkillProfiles(db, userId),
    loadCategoryExposure(db, userId, windowStart),
  ]);

  const signals: CategorySignals[] = categoryRows.map((category) => {
    const profile = profiles.get(category.id);
    const events = exposure.get(category.id);

    return {
      categorySlug: category.slug,
      rating: profile?.rating ?? STARTING_USER_RATING,
      exposureCount: events?.exposureCount ?? 0,
      recencyDays: events?.lastEventAt ? daysBetween(events.lastEventAt, now) : null,
    };
  });

  const derived = deriveAll(signals);

  const categories: LaunchCategory[] = categoryRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
  }));

  const slugToId = new Map(categories.map((category) => [category.slug, category.id]));

  return {
    categories,
    derived,
    bySlug: new Map(derived.map((signal) => [signal.categorySlug, signal])),
    byId: new Map(derived.map((signal) => [slugToId.get(signal.categorySlug)!, signal])),
    categoryBySlug: new Map(categories.map((category) => [category.slug, category])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
    lifetimeEventCounts: new Map(
      categories.map((category) => [
        category.id,
        exposure.get(category.id)?.lifetimeEventCount ?? 0,
      ]),
    ),
  };
}
