import 'server-only';
import { creditStreak } from '@learnarena/db';
import type { StreakStep } from '../sessions/hooks';
export const STREAK_STEP: StreakStep = { apply: creditStreak };
