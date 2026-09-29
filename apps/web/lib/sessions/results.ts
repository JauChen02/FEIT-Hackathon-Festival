import 'server-only';
import { proficiency, type SkillDelta } from '@learnarena/core';
import { loadSessionSkillMovements, type Database, type SessionRecord } from '@learnarena/db';

/**
 * Skill deltas for the results screen (PLANNING.md §20 screen 6).
 *
 * §24 Phase 3: "Results shows skill deltas after post-processing (**with a
 * pending state before**)."
 *
 * Returning `null` rather than an empty array is what carries that
 * distinction: null means `coach/process-session` has not run yet, an empty
 * array means it ran and moved nothing.
 */
export async function loadSkillDeltas(
  db: Database,
  session: SessionRecord,
  categorySlugForId: (categoryId: string) => string,
): Promise<SkillDelta[] | null> {
  // §18.3 sets this once the Coach job has applied the session's events. Until
  // then the deltas genuinely are not known.
  if (session.postProcessedAt === null) return null;

  const movements = await loadSessionSkillMovements(db, session.id);

  return movements.map((movement) => ({
    categorySlug: categorySlugForId(movement.categoryId),
    ratingBefore: movement.ratingBefore,
    ratingAfter: movement.ratingAfter,
    delta: movement.ratingAfter - movement.ratingBefore,
    proficiencyBefore: proficiency(movement.ratingBefore),
    proficiencyAfter: proficiency(movement.ratingAfter),
    eventCount: movement.eventCount,
  }));
}
