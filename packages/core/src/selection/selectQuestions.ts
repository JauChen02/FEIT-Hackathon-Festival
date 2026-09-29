/**
 * Question selection (PLANNING.md §11.6).
 *
 * Pedagogical target: ~70% expected success (ADR-010).
 *
 *   1. target = user_rating(category) − 147
 *   2. candidates: LIVE question versions in the category
 *   3. exclude versions the user answered in the last 7 days, unless fewer
 *      than 10 candidates would remain
 *   4. sort by |rating − target| ascending; ties broken by a PRNG seeded by
 *      session_id
 *   5. take the first 10; present them sorted by rating ascending (warm-up)
 *   6. the caller stores the result in `session_questions`
 *
 * Pure and deterministic: the same candidates and the same session id always
 * produce the same ten questions in the same order (§29).
 */

import { SOLO_QUESTION_COUNT, TARGET_RATING_OFFSET } from '../domain';
import { seededRandom, seededShuffle } from '../rand';

export interface QuestionCandidate {
  questionVersionId: string;
  /** Canonical Elo rating of the item (§11.2). */
  rating: number;
}

export interface SelectQuestionsInput {
  candidates: readonly QuestionCandidate[];
  /** Per-category Elo rating. 1000 until Phase 3 writes real ones. */
  userRating: number;
  /** Versions the user answered within the exclusion window (§11.6 step 3). */
  recentlyAnsweredVersionIds?: readonly string[];
  /** Seeds the tie-break, so a session's questions never change under it. */
  sessionId: string;
  count?: number;
}

export interface SelectQuestionsResult {
  /** Chosen versions in presentation order, position 0 first. */
  selected: QuestionCandidate[];
  /** `user_rating − 147`. */
  targetRating: number;
  /** True when step 3's exclusion was skipped to keep enough candidates. */
  exclusionRelaxed: boolean;
}

export class InsufficientQuestionsError extends Error {
  readonly available: number;
  readonly required: number;

  constructor(available: number, required: number) {
    super(
      `Not enough LIVE questions to build a session: ${available} available, ${required} required.`,
    );
    this.name = 'InsufficientQuestionsError';
    this.available = available;
    this.required = required;
  }
}

export function targetRatingFor(userRating: number): number {
  return userRating + TARGET_RATING_OFFSET;
}

export function selectQuestions(input: SelectQuestionsInput): SelectQuestionsResult {
  const count = input.count ?? SOLO_QUESTION_COUNT;
  const target = targetRatingFor(input.userRating);

  // Step 3. The exclusion is a preference, not a constraint: a category with
  // barely enough content must stay playable, so it is dropped wholesale
  // rather than partially.
  const recent = new Set(input.recentlyAnsweredVersionIds ?? []);
  const fresh = input.candidates.filter((candidate) => !recent.has(candidate.questionVersionId));
  const exclusionRelaxed = fresh.length < count;
  const pool = exclusionRelaxed ? input.candidates : fresh;

  if (pool.length < count) {
    throw new InsufficientQuestionsError(pool.length, count);
  }

  // Step 4. Shuffling first, then sorting by distance with a *stable* sort,
  // is what breaks ties randomly-but-deterministically: equal distances keep
  // their shuffled order.
  const random = seededRandom(input.sessionId);
  const shuffled = seededShuffle(pool, random);

  const byDistance = [...shuffled].sort((a, b) => {
    const distanceA = Math.abs(a.rating - target);
    const distanceB = Math.abs(b.rating - target);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return 0;
  });

  // Step 5.
  const chosen = byDistance.slice(0, count);
  const selected = [...chosen].sort((a, b) => {
    if (a.rating !== b.rating) return a.rating - b.rating;
    // Keep the tie-broken order among equal ratings, rather than re-deciding.
    return chosen.indexOf(a) - chosen.indexOf(b);
  });

  return { selected, targetRating: target, exclusionRelaxed };
}
