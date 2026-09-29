import type { Database } from '../client';
import { learningEvents } from '../schema';
/** All assessed modes use this canonical event writer, within their answer transaction. */
export async function recordLearningEvent(tx: Database, input: typeof learningEvents.$inferInsert) {
  await tx.insert(learningEvents).values(input);
}
