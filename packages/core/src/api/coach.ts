/**
 * Coach API response shapes (PLANNING.md §16.2, §20 screens 3, 6, 7).
 *
 * Shared by the route handlers and the client. Every derived value here is
 * computed at read time (§11.4) — none of it is stored.
 */

import type { WeaknessTier } from '../coach/tier';

/** One category on the Skills page (§20 screen 7). */
export interface CategorySkill {
  categorySlug: string;
  categoryName: string;
  /** The canonical Elo rating (§11.3). The only stored number here. */
  rating: number;
  proficiency: number;
  confidence: number;
  weaknessScore: number;
  staleness: number;
  exposureCount: number;
  recencyDays: number | null;
  /** How many events the learner has in this category, all time. */
  lifetimeEventCount: number;
  neverPlayed: boolean;
  /** The bonus a session in this category would currently carry (§11.8). */
  tier: WeaknessTier;
}

/** One point on the per-category rating history chart (§20 screen 7). */
export interface RatingHistoryPoint {
  at: string;
  ratingAfter: number;
  proficiency: number;
}

export interface RatingHistory {
  categorySlug: string;
  points: RatingHistoryPoint[];
}

/** `GET /api/me/skills` (§16.2). */
export interface SkillsResponse {
  categories: CategorySkill[];
  /** Top 2 by `proficiency × confidence`, confidence ≥ 0.3 (§11.4). */
  strengths: string[];
  /** Weakness score > 0.40, top 3 (§11.4). */
  weaknesses: string[];
  /** The slug the Coach is recommending today, when one has been generated. */
  recommendedCategorySlug: string | null;
  /** Per-category rating movement for the §20 screen 7 chart. */
  histories: RatingHistory[];
}

/** `GET /api/me/recommendation` (§16.2). */
export interface RecommendationResponse {
  recommendationId: string;
  categorySlug: string;
  categoryName: string;
  gameTypeSlug: string;
  status: 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  /** The user's local date this recommendation belongs to (§12.1). */
  localDate: string;
  targetRating: number;
  /** 1.5 while claimable; 1.0 once spent (§11.5). */
  bonusMultiplier: number;
  /** False once the bonus has been granted; the card stays visible (§11.5). */
  claimable: boolean;
  /** Why this category — the §11.5 step 5 snapshot, surfaced for the UI. */
  weaknessScore: number;
  proficiency: number;
  neverPlayed: boolean;
}

/** One category's movement from a single session (§20 screen 6). */
export interface SkillDelta {
  categorySlug: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  proficiencyBefore: number;
  proficiencyAfter: number;
  /** Learning events from this session that fed the change. */
  eventCount: number;
}
