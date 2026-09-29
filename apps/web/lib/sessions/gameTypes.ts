import 'server-only';
import { AppError, type GameTypeSlug } from '@learnarena/core';
import { eq } from 'drizzle-orm';
import { gameTypes } from '@learnarena/db/schema';
import { db } from '../db';

/**
 * Game-type lookup, cached for the life of the process.
 *
 * `game_types` is seeded reference data that changes only with a deploy, and
 * every session creation needs its id, so re-reading it per request would be a
 * round trip for a constant.
 */
const cache = new Map<string, string>();

export async function gameTypeIdForSlug(slug: GameTypeSlug): Promise<string> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const rows = await db()
    .select({ id: gameTypes.id, status: gameTypes.status })
    .from(gameTypes)
    .where(eq(gameTypes.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', { message: `Unknown game type ${slug}.` });
  }
  if (row.status !== 'ENABLED') {
    // Only quiz_solo is ENABLED in MVP; the rest are seeded but unplayable.
    throw new AppError('NOT_FOUND', { message: `${slug} is not available yet.` });
  }

  cache.set(slug, row.id);
  return row.id;
}

/** Tests point the app at a fresh database per file, so the cache must reset. */
export function clearGameTypeCache(): void {
  cache.clear();
}
