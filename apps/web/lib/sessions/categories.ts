import 'server-only';
import { eq } from 'drizzle-orm';
import { categories, type Database } from '@learnarena/db';

/**
 * Category slug lookup, cached for the life of the process.
 *
 * `categories` is seeded reference data; the results payload needs the slug
 * for every completed session, and re-reading it each time would be a round
 * trip for a constant.
 */
const slugCache = new Map<string, string>();

export async function categorySlugForId(db: Database, categoryId: string | null): Promise<string> {
  if (!categoryId) return '';

  const cached = slugCache.get(categoryId);
  if (cached) return cached;

  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  const slug = rows[0]?.slug ?? '';
  if (slug) slugCache.set(categoryId, slug);
  return slug;
}

/** Tests point the app at a fresh database per file, so the cache must reset. */
export function clearCategoryCache(): void {
  slugCache.clear();
}
