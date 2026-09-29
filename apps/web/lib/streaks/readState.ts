import 'server-only';
import { streakStateFor } from '@learnarena/core';
import { loadStreakData, type Database } from '@learnarena/db';
export async function readStreakState(db: Database, userId: string, today: string) {
  const { days, freezes } = await loadStreakData(db, userId);
  return streakStateFor(days, freezes, today);
}
