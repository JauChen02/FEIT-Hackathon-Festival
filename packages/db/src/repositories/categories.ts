/**
 * Category repository (PLANNING.md §16.2: `GET /api/categories` returns
 * "launch categories with live-question counts").
 */

import { and, count, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { categories, questionVersions } from '../schema/index';

export interface LaunchCategory {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  /** Number of LIVE question versions available to play right now. */
  liveQuestionCount: number;
}

/**
 * Launch categories with their LIVE question counts.
 *
 * Non-launch categories exist as rows (ADR-036) but are filtered out here, so
 * the client only ever sees something it can actually play.
 */
export async function listLaunchCategories(db: Database): Promise<LaunchCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      icon: categories.icon,
      liveQuestionCount: count(questionVersions.id),
    })
    .from(categories)
    .leftJoin(
      questionVersions,
      and(eq(questionVersions.categoryId, categories.id), eq(questionVersions.status, 'LIVE')),
    )
    .where(eq(categories.status, 'LAUNCH'))
    .groupBy(categories.id, categories.slug, categories.name, categories.icon)
    .orderBy(categories.slug);

  return rows;
}

export async function findCategoryBySlug(db: Database, slug: string) {
  const rows = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return rows[0];
}
