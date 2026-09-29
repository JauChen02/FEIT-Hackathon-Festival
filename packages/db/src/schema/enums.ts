/**
 * Postgres enums (PLANNING.md §14.1: "Enums: Postgres enums (declared via
 * Drizzle pgEnum). No free-form status strings.").
 *
 * Values are imported from @learnarena/core where a transition table already
 * owns them (§15), so the database and the domain logic cannot drift apart.
 */

import { pgEnum } from 'drizzle-orm/pg-core';
import {
  CONTENT_STATUSES,
  FREEZE_STATUSES,
  RECOMMENDATION_STATUSES,
  SESSION_STATUSES,
} from '@learnarena/core';

/** §13.1 */
export const userRoleEnum = pgEnum('user_role', ['AUTHOR', 'REVIEWER', 'ADMIN']);

/** §14.2. Non-launch categories are seeded DEFERRED (ADR-036). */
export const categoryStatusEnum = pgEnum('category_status', ['LAUNCH', 'ACTIVE', 'DEFERRED']);

/** §14.2. Copied onto game_sessions at creation so the partial index can use it. */
export const gameModeEnum = pgEnum('game_mode', ['SOLO', 'COOP', 'VERSUS']);

export const gameTypeStatusEnum = pgEnum('game_type_status', ['ENABLED', 'DISABLED']);

/** §13.3 / §15.7 */
export const contentStatusEnum = pgEnum('content_status', CONTENT_STATUSES);

/** §13.5. AI_GENERATED can never reach LIVE without human approval (§13.3). */
export const contentOriginEnum = pgEnum('content_origin', ['HUMAN', 'AI_GENERATED', 'DEV_SEED']);

/** §8.1. ORDER and MATCH arrive in Alpha via ALTER TYPE … ADD VALUE (ADR-037). */
export const questionTypeEnum = pgEnum('question_type', ['MCQ', 'NUMERIC']);

/** §15.1 */
export const sessionStatusEnum = pgEnum('session_status', SESSION_STATUSES);

/** §11.8 */
export const weaknessTierEnum = pgEnum('weakness_tier', ['NONE', 'WEAK', 'RECOMMENDED']);

/** §8.7. Solo sessions leave session_players.team NULL. */
export const teamSideEnum = pgEnum('team_side', ['A', 'B']);

/** §14.2 */
export const answerOutcomeEnum = pgEnum('answer_outcome', ['ANSWERED', 'TIMEOUT']);

/** §15.5 */
export const recommendationStatusEnum = pgEnum('recommendation_status', RECOMMENDATION_STATUSES);

/** §14.2. Corrections are ADJUSTMENT rows, never updates (Invariant 3). */
export const ledgerReasonEnum = pgEnum('ledger_reason', [
  'SESSION_COMPLETION',
  'DAILY_CHALLENGE_BONUS',
  'ACHIEVEMENT',
  'ADJUSTMENT',
]);

/** §12.1 */
export const streakDaySourceEnum = pgEnum('streak_day_source', ['PLAYED', 'FROZEN']);

/** §15.6 */
export const freezeStatusEnum = pgEnum('freeze_status', FREEZE_STATUSES);
