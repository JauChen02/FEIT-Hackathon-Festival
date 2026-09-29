/**
 * Domain constants shared by the web app, the database package and the CLI
 * commands. Values come straight from PLANNING.md; nothing here is invented.
 */

/** §2.1: launch categories for MVP (ADR-002). */
export const LAUNCH_CATEGORY_SLUGS = ['math', 'logic', 'science'] as const;
export type LaunchCategorySlug = (typeof LAUNCH_CATEGORY_SLUGS)[number];

/** §2.1: the long-term taxonomy. Non-launch categories are seeded as DEFERRED (ADR-036). */
export const ALL_CATEGORY_SLUGS = [
  'math',
  'logic',
  'science',
  'memory',
  'language',
  'history',
] as const;
export type CategorySlug = (typeof ALL_CATEGORY_SLUGS)[number];

export function isLaunchCategory(slug: string): slug is LaunchCategorySlug {
  return (LAUNCH_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

/** §6: the playable formats. Only `quiz_solo` is ENABLED in MVP. */
export const GAME_TYPE_SLUGS = [
  'quiz_solo',
  'quiz_coop',
  'team_deathmatch',
  'memory_match',
  'speed_math',
  'dialogue_scenario',
] as const;
export type GameTypeSlug = (typeof GAME_TYPE_SLUGS)[number];

/** §8.1: solo quiz shape. */
export const SOLO_QUESTION_COUNT = 10;
export const SOLO_TIME_LIMIT_MS = 20_000;
/** §8.2: answers are accepted up to this long after the deadline. */
export const ANSWER_GRACE_MS = 1_000;

/** §11.3: every (user, category) skill profile starts here. */
export const STARTING_USER_RATING = 1000;

/** §11.6: item rating offset that targets ~70% expected success (ADR-010). */
export const TARGET_RATING_OFFSET = -147;

/** §6: a session qualifies when at least this share of questions were ANSWERED. */
export const QUALIFYING_ANSWERED_RATIO = 0.5;

/** §10.1: added to the raw base on COMPLETED. Not combo-multiplied (§10.2). */
export const COMPLETION_BONUS = 50;

/** §10.1: final points can never exceed this multiple of the raw base. */
export const TOTAL_MULT_CAP = 4;

/** §10.1: consecutive fully-correct answers stop counting past this. */
export const COMBO_CAP = 10;

/** §11.6 step 3: versions answered inside this window are avoided if possible. */
export const RECENT_ANSWER_EXCLUSION_DAYS = 7;

/** §18.3: reconcile re-sends for terminal sessions unprocessed for this long. */
export const RECONCILE_GRACE_MS = 10 * 60 * 1000;

/** §19.1: request bodies above this size are rejected with PAYLOAD_TOO_LARGE. */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024;
