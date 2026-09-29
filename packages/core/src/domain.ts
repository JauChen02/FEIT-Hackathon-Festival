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

// ---------------------------------------------------------------------------
// Coach (§11)
// ---------------------------------------------------------------------------

/** §11.3: K is 32 below this many lifetime events in the category, 16 from it. */
export const K_FACTOR_SWITCH_AT = 50;
export const K_FACTOR_LOW = 32;
export const K_FACTOR_HIGH = 16;

/** §11.4: `proficiency = clamp((rating − 600) / 8, 0, 100)`. */
export const PROFICIENCY_FLOOR_RATING = 600;
export const PROFICIENCY_DIVISOR = 8;

/** §11.4: `confidence = 1 − exp(−exposure_count / 30)`. */
export const CONFIDENCE_SCALE = 30;

/** §11.4: exposure counts learning events from the last 60 days. */
export const EXPOSURE_WINDOW_DAYS = 60;

/** §11.4: `staleness = min(recency_days / 14, 1)`. */
export const STALENESS_SATURATION_DAYS = 14;

/** §11.4 weakness weights. They sum to 1, so the score stays in 0..1. */
export const WEAKNESS_SKILL_WEIGHT = 0.5;
export const WEAKNESS_EXPOSURE_WEIGHT = 0.35;
export const WEAKNESS_STALENESS_WEIGHT = 0.15;

/** §11.4: a category is weak above — strictly above — this score. */
export const WEAKNESS_THRESHOLD = 0.4;
export const MAX_WEAK_CATEGORIES = 3;

/** §11.4: strengths are the top 2 with confidence at or above 0.3. */
export const MAX_STRENGTHS = 2;
export const STRENGTH_MIN_CONFIDENCE = 0.3;
/**
 * A strength must also sit above the starting rating (ADR-053).
 *
 * §11.4 ranks strengths by `proficiency × confidence` without a proficiency
 * floor, so a learner who has played exactly one category is told it is their
 * "strongest" however badly they are doing — the `fx_weak` fixture scores 39
 * proficiency at 30% accuracy and would still be labelled strong. 50 is the
 * proficiency of the 1000 starting rating, so this asks only that a strength
 * be something the learner has actually demonstrated.
 */
export const STRENGTH_MIN_PROFICIENCY = 50;

/** §11.5 step 2: how often the Coach recommends something other than the top pick. */
export const EXPLORATION_PROBABILITY = 0.1;

/** §10.1: `tier_mult` by weakness tier. */
export const TIER_MULTIPLIERS = {
  NONE: 1,
  WEAK: 1.25,
  RECOMMENDED: 1.5,
} as const;

/** §11.7 improvement bonus. */
export const IMPROVEMENT_BONUS = 0.25;
export const IMPROVEMENT_THRESHOLD = 0.1;
export const IMPROVEMENT_MIN_PRIOR_SESSIONS = 3;
export const IMPROVEMENT_BASELINE_SESSIONS = 5;

/** §19.1: request bodies above this size are rejected with PAYLOAD_TOO_LARGE. */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024;
