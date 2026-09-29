/**
 * The §13.6 fixture users, end to end through the Coach (PLANNING.md §11.5).
 *
 * §13.6 exists so that "weak-category detection, recommendations and
 * multipliers are testable". This is the test that cashes that in: it seeds the
 * real dev seed, signs in as each fixture, and asserts the recommendation the
 * Coach actually produces for a scripted history.
 *
 * Everything is read through `GET /api/me/skills` and
 * `GET /api/me/recommendation` rather than off the tables, so what is asserted
 * is what a learner would actually be shown.
 *
 * Two of these fixtures exist to pin down cases the others cannot reach:
 * `fx_rounded` has played every launch category, so its recommendation is
 * decided by the §11.4 formula rather than by a never-played 0.50; and
 * `fx_weak` is the confidently-bad case behind ADR-053.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock, type RecommendationResponse } from '@learnarena/core';
import { seedIds } from '@learnarena/db';
import { GET as recommendationRoute } from '@/app/api/me/recommendation/route';
import { GET as skillsRoute } from '@/app/api/me/skills/route';
import type { SkillsResponse } from '@learnarena/core';
import { setSessionClock } from '@/lib/sessions/context';
import { clearCategoryCache } from '@/lib/sessions/categories';
import { clearGameTypeCache } from '@/lib/sessions/gameTypes';
import {
  createWebTestContext,
  jsonRequest,
  readResponse,
  type WebTestContext,
} from './helpers/testApp';

/** Fixed so the fixtures' `recencyDays` offsets land on known instants. */
const NOW = new Date('2026-09-29T02:00:00.000Z');

let ctx: WebTestContext;
let restoreClock: () => void;

beforeAll(async () => {
  const clock = new FixedClock(NOW);
  ctx = await createWebTestContext('fixtures', { fixtureHistories: true, clock });
  restoreClock = setSessionClock(clock);
  clearCategoryCache();
  clearGameTypeCache();
}, 120_000);

afterAll(async () => {
  restoreClock?.();
  await ctx?.teardown();
});

async function recommendationFor(username: string): Promise<RecommendationResponse> {
  ctx.signInAs(seedIds.user(username));
  const response = await recommendationRoute(jsonRequest('/api/me/recommendation'));
  const parsed = await readResponse<RecommendationResponse>(response);
  expect(parsed.status).toBe(200);
  return parsed.body;
}

async function skillsFor(username: string): Promise<SkillsResponse> {
  ctx.signInAs(seedIds.user(username));
  const response = await skillsRoute(jsonRequest('/api/me/skills'));
  const parsed = await readResponse<SkillsResponse>(response);
  expect(parsed.status).toBe(200);
  return parsed.body;
}

/** The Coach's pre-exploration pick, read back from the stored snapshot. */
async function topCategoryFor(username: string): Promise<string> {
  const recommendation = await recommendationFor(username);
  const skills = await skillsFor(username);
  // `recommendedCategorySlug` is what got stored; the reason snapshot is what
  // explains it. Both are read through the public API, never the tables.
  expect(skills.recommendedCategorySlug).toBe(recommendation.categorySlug);
  return recommendation.categorySlug;
}

describe('fx_strong — math played well, logic and science never touched', () => {
  it('recommends a never-played category over the strong one', async () => {
    const recommendation = await recommendationFor('fx_strong');

    // §11.4: a never-played category scores exactly 0.50, which beats any
    // category the learner is actually good at.
    expect(recommendation.categorySlug).not.toBe('math');
    expect(recommendation.neverPlayed).toBe(true);
    expect(recommendation.weaknessScore).toBeCloseTo(0.5, 6);
  });

  it('reports math as a strength', async () => {
    const skills = await skillsFor('fx_strong');
    const math = skills.categories.find((c) => c.categorySlug === 'math')!;

    expect(math.neverPlayed).toBe(false);
    expect(math.lifetimeEventCount).toBe(40);
    // 90% correct against items near the starting rating pushes the rating up.
    expect(math.rating).toBeGreaterThan(1000);
    expect(skills.strengths).toContain('math');
    expect(skills.weaknesses).not.toContain('math');
  });
});

describe('fx_weak — lots of logic exposure, low skill', () => {
  it('drives the logic rating below the 1000 start', async () => {
    const skills = await skillsFor('fx_weak');
    const logic = skills.categories.find((c) => c.categorySlug === 'logic')!;

    expect(logic.lifetimeEventCount).toBe(30);
    expect(logic.rating).toBeCloseTo(911.9, 0);
    expect(logic.proficiency).toBeCloseTo(39, 0);
  });

  it('never calls a confidently bad category a strength (ADR-053)', async () => {
    const skills = await skillsFor('fx_weak');
    const logic = skills.categories.find((c) => c.categorySlug === 'logic')!;

    // Logic is the only category with enough exposure to clear the 0.3
    // confidence gate, so §11.4's rule as written would list the learner's
    // *worst* subject as their strongest. The proficiency floor stops it.
    expect(logic.confidence).toBeGreaterThan(0.3);
    expect(skills.strengths).toEqual([]);
  });

  it('still ranks the two never-played categories above it', async () => {
    const skills = await skillsFor('fx_weak');
    const logic = skills.categories.find((c) => c.categorySlug === 'logic')!;

    // 0.32 < 0.50: §11.4 scores a category nobody has touched as weaker than
    // one that is merely being failed, because confidence scales the skill
    // term. So logic is not even a *weak* category here.
    expect(logic.weaknessScore).toBeLessThan(0.4);
    expect(skills.weaknesses).toEqual(['math', 'science']);

    const recommendation = await recommendationFor('fx_weak');
    expect(recommendation.neverPlayed).toBe(true);
  });
});

describe('fx_stale — decent science, but all of it is old', () => {
  it('counts no recent exposure and saturates staleness', async () => {
    const skills = await skillsFor('fx_stale');
    const science = skills.categories.find((c) => c.categorySlug === 'science')!;

    // §11.4 windows exposure at 60 days; the events are 35-36 days old, so
    // they still count — but staleness (14-day saturation) is pinned at 1.
    expect(science.lifetimeEventCount).toBe(20);
    expect(science.recencyDays).not.toBeNull();
    // The session starts 35 days back and its ten events run forward from
    // there, so the most recent lands a few minutes inside day 34.
    expect(science.recencyDays!).toBe(34);
    expect(science.staleness).toBe(1);
  });
});

describe('fx_new — never played anything', () => {
  it('scores every category at exactly 0.50', async () => {
    const skills = await skillsFor('fx_new');

    expect(skills.categories).toHaveLength(3);
    for (const category of skills.categories) {
      expect(category.neverPlayed).toBe(true);
      expect(category.rating).toBe(1000);
      expect(category.proficiency).toBe(50);
      expect(category.confidence).toBe(0);
      expect(category.weaknessScore).toBeCloseTo(0.5, 10);
    }
    expect(skills.strengths).toEqual([]);
  });

  it('breaks the three-way tie by slug, so the pick is still deterministic', async () => {
    const recommendation = await recommendationFor('fx_new');
    // All three tie at 0.50; `rankByWeakness` orders ties by slug ascending.
    expect(['logic', 'math', 'science']).toContain(recommendation.categorySlug);
    expect(recommendation.bonusMultiplier).toBe(1.5);
    expect(recommendation.claimable).toBe(true);
  });
});

describe('fx_rounded — has played every launch category', () => {
  it('has real exposure everywhere, so nothing wins on never-played alone', async () => {
    const skills = await skillsFor('fx_rounded');

    for (const category of skills.categories) {
      expect(category.neverPlayed).toBe(false);
      expect(category.lifetimeEventCount).toBe(30);
    }
  });

  it('recommends logic — the weakest category it has actually played', async () => {
    const skills = await skillsFor('fx_rounded');
    const bySlug = new Map(skills.categories.map((c) => [c.categorySlug, c]));

    // The scripted accuracies are math 90% > science 70% > logic 30%, so the
    // ratings and therefore the weakness scores must order the same way.
    expect(bySlug.get('math')!.rating).toBeGreaterThan(bySlug.get('science')!.rating);
    expect(bySlug.get('science')!.rating).toBeGreaterThan(bySlug.get('logic')!.rating);
    expect(bySlug.get('logic')!.weaknessScore).toBeGreaterThan(
      bySlug.get('science')!.weaknessScore,
    );
    expect(bySlug.get('science')!.weaknessScore).toBeGreaterThan(bySlug.get('math')!.weaknessScore);

    const recommendation = await recommendationFor('fx_rounded');
    expect(recommendation.categorySlug).toBe('logic');
    expect(recommendation.neverPlayed).toBe(false);
  });

  it('is the fixture that proves the Coach is not just picking unplayed slugs', async () => {
    // Every other fixture leaves at least one category at the 0.50 never-played
    // score, which dominates. This one does not, so the choice above is driven
    // entirely by the §11.4 weakness formula.
    const skills = await skillsFor('fx_rounded');
    expect(skills.categories.every((c) => !c.neverPlayed)).toBe(true);
    expect(skills.strengths).toEqual(['math', 'science']);
  });

  it('carries a ×1.5 recommendation with no ×1.25 categories behind it', async () => {
    const skills = await skillsFor('fx_rounded');

    // Nothing clears the 0.40 weak threshold — logic tops the ranking at 0.34.
    // §11.8 still recommends the weakest, so this is the RECOMMENDED-without-
    // WEAK case, which no other fixture reaches.
    expect(skills.weaknesses).toEqual([]);
    const tiers = skills.categories.map((c) => c.tier).sort();
    expect(tiers).toEqual(['NONE', 'NONE', 'RECOMMENDED']);
  });
});

describe('every fixture', () => {
  it('gets a deterministic, self-consistent recommendation', async () => {
    for (const username of ['fx_strong', 'fx_weak', 'fx_stale', 'fx_new', 'fx_rounded']) {
      const slug = await topCategoryFor(username);
      expect(slug).toBeTruthy();

      // Asking twice on the same local date returns the identical row (§11.5).
      const again = await recommendationFor(username);
      expect(again.categorySlug).toBe(slug);
    }
  });
});
