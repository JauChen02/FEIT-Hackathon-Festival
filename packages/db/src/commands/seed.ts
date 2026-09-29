/**
 * `pnpm db:seed` — the development seed (PLANNING.md §13.6).
 *
 * Contents:
 *   1. Taxonomy — all six §2.1 categories (three LAUNCH), all six game types
 *      (only `quiz_solo` ENABLED), and the game-type/category links.
 *   2. Content users — `seed_author` and `seed_reviewer`, so imported versions
 *      have a real author and a reviewer who is not the author (§13.1).
 *   3. Questions — imported from `content/`: 15 per launch category, 3 at each
 *      difficulty 1..5, exceeding the §13.6 floor of 12 with ≥2 per level.
 *   4. Fixture users with scripted learning histories, covering a strong
 *      category, a low-skill weak category, a stale category and a never-played
 *      user, so weak-category detection, recommendations and multipliers are
 *      testable from Phase 3 onward.
 *
 * Everything is deterministic: fixed ids (see seedIds.ts) and an explicit
 * correctness pattern rather than randomness, so two runs produce byte-identical
 * rows and a test can assert exact ratings.
 *
 * Idempotent: re-running upserts taxonomy and users, and the content import is
 * itself a no-op for unchanged files. Fixture histories are skipped entirely if
 * they already exist, because learning events are immutable (§9).
 */

// Must be first: populates process.env from .env.local before anything reads it.
import '../loadEnv';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import {
  ALL_CATEGORY_SLUGS,
  LAUNCH_CATEGORY_SLUGS,
  SOLO_QUESTION_COUNT,
  SOLO_TIME_LIMIT_MS,
  STARTING_USER_RATING,
  systemClock,
  type CategorySlug,
  type Clock,
  type GameTypeSlug,
} from '@learnarena/core';
import type { Database } from '../client';
import { assertDevSeedAllowed, readAppEnv } from '../env';
import { createDatabase } from '../client';
import { seedIds } from '../seedIds';
import {
  answers,
  categories,
  gameSessions,
  gameTypeCategories,
  gameTypes,
  learningEvents,
  questionVersions,
  sessionPlayers,
  sessionQuestions,
  skillProfiles,
  skillUpdates,
  userRoles,
  users,
} from '../schema/index';
import { importContent, type ContentImportSummary } from './contentImport';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const CONTENT_DIR = path.join(REPO_ROOT, 'content');

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<CategorySlug, { name: string; icon: string }> = {
  math: { name: 'Math', icon: 'calculator' },
  logic: { name: 'Logic', icon: 'puzzle' },
  science: { name: 'Science', icon: 'flask' },
  memory: { name: 'Memory', icon: 'brain' },
  language: { name: 'Language', icon: 'book' },
  history: { name: 'History', icon: 'scroll' },
};

const GAME_TYPE_META: Record<
  GameTypeSlug,
  { name: string; mode: 'SOLO' | 'COOP' | 'VERSUS'; enabled: boolean }
> = {
  quiz_solo: { name: 'Solo Quiz', mode: 'SOLO', enabled: true },
  quiz_coop: { name: 'Co-op Quiz', mode: 'COOP', enabled: false },
  team_deathmatch: { name: 'Team Deathmatch', mode: 'VERSUS', enabled: false },
  memory_match: { name: 'Memory Match', mode: 'SOLO', enabled: false },
  speed_math: { name: 'Speed Math', mode: 'SOLO', enabled: false },
  dialogue_scenario: { name: 'Dialogue Scenario', mode: 'SOLO', enabled: false },
};

async function seedTaxonomy(db: Database): Promise<void> {
  await db
    .insert(categories)
    .values(
      ALL_CATEGORY_SLUGS.map((slug) => ({
        id: seedIds.category(slug),
        slug,
        name: CATEGORY_META[slug].name,
        icon: CATEGORY_META[slug].icon,
        // ADR-002/ADR-036: only math, logic and science launch. The rest exist
        // as rows so the taxonomy is complete, but are DEFERRED.
        status: (LAUNCH_CATEGORY_SLUGS as readonly string[]).includes(slug)
          ? ('LAUNCH' as const)
          : ('DEFERRED' as const),
      })),
    )
    .onConflictDoUpdate({
      target: categories.slug,
      set: {
        name: sql`excluded.name`,
        icon: sql`excluded.icon`,
        status: sql`excluded.status`,
      },
    });

  await db
    .insert(gameTypes)
    .values(
      (Object.keys(GAME_TYPE_META) as GameTypeSlug[]).map((slug) => ({
        id: seedIds.gameType(slug),
        slug,
        name: GAME_TYPE_META[slug].name,
        mode: GAME_TYPE_META[slug].mode,
        status: GAME_TYPE_META[slug].enabled ? ('ENABLED' as const) : ('DISABLED' as const),
      })),
    )
    .onConflictDoUpdate({
      target: gameTypes.slug,
      set: { name: sql`excluded.name`, mode: sql`excluded.mode`, status: sql`excluded.status` },
    });

  // quiz_solo is playable in every launch category (§11.5 step 3 reads this).
  await db
    .insert(gameTypeCategories)
    .values(
      LAUNCH_CATEGORY_SLUGS.map((slug) => ({
        gameTypeId: seedIds.gameType('quiz_solo'),
        categoryId: seedIds.category(slug),
      })),
    )
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * §13.1 needs an author and a distinct reviewer for every published version.
 * These are ordinary `users` rows with no Supabase auth identity, so they can
 * never sign in (ADR-026).
 */
const CONTENT_USERS = [
  { username: 'seed_author', displayName: 'Seed Author', role: 'AUTHOR' as const },
  { username: 'seed_reviewer', displayName: 'Seed Reviewer', role: 'REVIEWER' as const },
];

interface FixtureSpec {
  username: string;
  displayName: string;
  category: CategorySlug | null;
  /** Number of completed 10-question sessions. */
  sessions: number;
  /** Share of answers that are correct, applied as an exact deterministic pattern. */
  accuracy: number;
  /** Days before "now" at which the most recent session happened. */
  recencyDays: number;
  note: string;
}

/**
 * §13.6: "Fixture users with scripted learning histories covering: a strong
 * category, a low-skill weak category, a never-played category and a stale
 * category, so weak-category detection, recommendations and multipliers are
 * testable."
 */
export const FIXTURE_USERS: readonly FixtureSpec[] = [
  {
    username: 'fx_strong',
    displayName: 'Fixture Strong',
    category: 'math',
    sessions: 4,
    accuracy: 0.9,
    recencyDays: 1,
    note: 'High proficiency and high confidence in math; logic and science never played.',
  },
  {
    username: 'fx_weak',
    displayName: 'Fixture Weak',
    category: 'logic',
    sessions: 3,
    accuracy: 0.3,
    recencyDays: 1,
    note: 'Plenty of exposure in logic but low skill — the weak-and-frequent case.',
  },
  {
    username: 'fx_stale',
    displayName: 'Fixture Stale',
    category: 'science',
    sessions: 2,
    accuracy: 0.7,
    recencyDays: 35,
    note: 'Decent science skill, but every event is outside the 60-day exposure window.',
  },
  {
    username: 'fx_new',
    displayName: 'Fixture New',
    category: null,
    sessions: 0,
    accuracy: 0,
    recencyDays: 0,
    note: 'Never played anything — every category scores the 0.50 never-played weakness.',
  },
];

async function seedUsers(db: Database, now: Date): Promise<void> {
  const rows = [
    ...CONTENT_USERS.map((user) => ({
      id: seedIds.user(user.username),
      username: user.username,
      displayName: user.displayName,
      timezone: 'UTC',
      ageConfirmedAt: now,
      onboardingCompletedAt: now,
    })),
    ...FIXTURE_USERS.map((fixture) => ({
      id: seedIds.user(fixture.username),
      username: fixture.username,
      displayName: fixture.displayName,
      timezone: 'Australia/Melbourne',
      ageConfirmedAt: now,
      onboardingCompletedAt: now,
    })),
  ];

  await db
    .insert(users)
    .values(rows)
    .onConflictDoUpdate({
      target: users.id,
      set: { displayName: sql`excluded.display_name`, updatedAt: now },
    });

  await db
    .insert(userRoles)
    .values(CONTENT_USERS.map((user) => ({ userId: seedIds.user(user.username), role: user.role })))
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Fixture learning histories
// ---------------------------------------------------------------------------

/**
 * Spread `count` correct answers evenly across `total` items.
 *
 * Deterministic by construction and hits the target accuracy exactly, which
 * matters because Phase 3's improvement bonus compares session accuracies
 * against a baseline (§11.7).
 */
function correctnessPattern(total: number, accuracy: number): boolean[] {
  const correct = Math.round(total * accuracy);
  // Bresenham-style: mark an item correct whenever the running quota crosses an
  // integer boundary. Yields exactly `correct` trues, spread evenly rather than
  // bunched at the front — which keeps the seeded combo streaks realistic.
  const pattern: boolean[] = [];
  let quota = 0;
  for (let index = 0; index < total; index += 1) {
    const next = quota + correct;
    pattern.push(Math.floor(next / total) > Math.floor(quota / total));
    quota = next;
  }
  return pattern;
}

/** §11.3 Elo update, mirrored here so the seeded profile matches what Phase 3 computes. */
function applyElo(
  userRating: number,
  itemRating: number,
  correctness: number,
  lifetimeEventCount: number,
): { expected: number; kFactor: number; ratingAfter: number } {
  const expected = 1 / (1 + 10 ** ((itemRating - userRating) / 400));
  const kFactor = lifetimeEventCount < 50 ? 32 : 16;
  return { expected, kFactor, ratingAfter: userRating + kFactor * (correctness - expected) };
}

async function seedFixtureHistories(db: Database, now: Date): Promise<number> {
  const quizSoloId = seedIds.gameType('quiz_solo');
  let eventsWritten = 0;

  for (const fixture of FIXTURE_USERS) {
    if (fixture.category === null || fixture.sessions === 0) continue;

    const userId = seedIds.user(fixture.username);
    const categoryId = seedIds.category(fixture.category);

    // Learning events are immutable (§9), so an existing history is left alone
    // rather than rewritten.
    const existing = await db
      .select({ id: learningEvents.id })
      .from(learningEvents)
      .where(eq(learningEvents.userId, userId))
      .limit(1);
    if (existing.length > 0) continue;

    const pool = await db
      .select({ id: questionVersions.id, rating: questionVersions.rating })
      .from(questionVersions)
      .where(and(eq(questionVersions.categoryId, categoryId), eq(questionVersions.status, 'LIVE')))
      .orderBy(questionVersions.rating, questionVersions.id);

    if (pool.length < SOLO_QUESTION_COUNT) {
      throw new Error(
        `Fixture ${fixture.username} needs ${SOLO_QUESTION_COUNT} LIVE ${fixture.category} ` +
          `questions but found ${pool.length}. Run content:import first.`,
      );
    }

    let rating = STARTING_USER_RATING;
    let lifetimeEventCount = 0;

    for (let sessionIndex = 0; sessionIndex < fixture.sessions; sessionIndex += 1) {
      // Most recent session is `recencyDays` ago; earlier ones step back a day.
      const daysAgo = fixture.recencyDays + (fixture.sessions - 1 - sessionIndex);
      const sessionStart = new Date(now.getTime() - daysAgo * 86_400_000);
      const sessionId = seedIds.session(fixture.username, sessionIndex);
      const pattern = correctnessPattern(SOLO_QUESTION_COUNT, fixture.accuracy);

      await db.transaction(async (tx) => {
        await tx.insert(gameSessions).values({
          id: sessionId,
          gameTypeId: quizSoloId,
          mode: 'SOLO',
          categoryId,
          ownerId: userId,
          status: 'COMPLETED',
          weaknessTier: 'NONE',
          weaknessSnapshotJson: { seeded: true, note: fixture.note },
          questionCount: SOLO_QUESTION_COUNT,
          timeLimitMs: SOLO_TIME_LIMIT_MS,
          creationIdempotencyKey: seedIds.session(fixture.username, sessionIndex),
          localDate: sessionStart.toISOString().slice(0, 10),
          isQualifying: true,
          createdAt: sessionStart,
          startedAt: sessionStart,
          lastActivityAt: sessionStart,
          endedAt: sessionStart,
          // Already post-processed: the seeded skill_updates below are the
          // audit trail, so coach/process-session must not re-apply them.
          postProcessedAt: sessionStart,
        });

        await tx.insert(sessionPlayers).values({ sessionId, userId });

        for (let position = 0; position < SOLO_QUESTION_COUNT; position += 1) {
          // Rotate through the pool so sessions differ but stay deterministic.
          const version = pool[(sessionIndex * SOLO_QUESTION_COUNT + position) % pool.length]!;
          const isCorrect = pattern[position]!;
          const correctness = isCorrect ? 1 : 0;
          const occurredAt = new Date(sessionStart.getTime() + position * 15_000);
          const answerId = seedIds.answer(fixture.username, sessionIndex, position);

          await tx.insert(sessionQuestions).values({
            sessionId,
            position,
            questionVersionId: version.id,
            servedAt: occurredAt,
            deadlineAt: new Date(occurredAt.getTime() + SOLO_TIME_LIMIT_MS),
          });

          await tx.insert(answers).values({
            id: answerId,
            sessionId,
            userId,
            questionVersionId: version.id,
            position,
            outcome: 'ANSWERED',
            responseJson: { seeded: true },
            correctness: correctness.toFixed(3),
            speedFactor: '0.7500',
            responseTimeMs: 5_000,
            serverReceivedAt: occurredAt,
          });

          const eventId = seedIds.learningEvent(fixture.username, sessionIndex, position);
          await tx.insert(learningEvents).values({
            id: eventId,
            userId,
            sessionId,
            gameTypeId: quizSoloId,
            sourceKey: version.id,
            questionVersionId: version.id,
            answerId,
            categoryId,
            difficultyRating: version.rating,
            correctness: correctness.toFixed(3),
            timedOut: false,
            responseTimeMs: 5_000,
            occurredAt,
            createdAt: occurredAt,
          });

          const itemRating = Number(version.rating);
          const update = applyElo(rating, itemRating, correctness, lifetimeEventCount);
          await tx.insert(skillUpdates).values({
            id: seedIds.skillUpdate(fixture.username, sessionIndex, position),
            learningEventId: eventId,
            userId,
            categoryId,
            ratingBefore: rating.toFixed(2),
            ratingAfter: update.ratingAfter.toFixed(2),
            expected: update.expected.toFixed(5),
            kFactor: update.kFactor,
            createdAt: occurredAt,
          });

          rating = Number(update.ratingAfter.toFixed(2));
          lifetimeEventCount += 1;
          eventsWritten += 1;
        }
      });
    }

    const lastEventAt = new Date(now.getTime() - fixture.recencyDays * 86_400_000);
    await db
      .insert(skillProfiles)
      .values({
        userId,
        categoryId,
        rating: rating.toFixed(2),
        lifetimeEventCount,
        lastEventAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [skillProfiles.userId, skillProfiles.categoryId],
        set: {
          rating: rating.toFixed(2),
          lifetimeEventCount,
          lastEventAt,
          updatedAt: now,
        },
      });
  }

  return eventsWritten;
}

// ---------------------------------------------------------------------------

export interface SeedSummary {
  categories: number;
  gameTypes: number;
  users: number;
  content: ContentImportSummary;
  learningEvents: number;
}

export interface SeedOptions {
  clock?: Clock;
  contentDir?: string;
  /** Skip the fixture histories (useful for tests that build their own data). */
  skipFixtureHistories?: boolean;
}

export async function seedDatabase(db: Database, options: SeedOptions = {}): Promise<SeedSummary> {
  assertDevSeedAllowed();
  const now = (options.clock ?? systemClock).now();

  await seedTaxonomy(db);
  await seedUsers(db, now);

  const content = await importContent(db, {
    dir: options.contentDir ?? CONTENT_DIR,
    forbiddenOrigins: readAppEnv() === 'production' ? ['DEV_SEED'] : [],
  });

  const eventCount = options.skipFixtureHistories ? 0 : await seedFixtureHistories(db, now);

  return {
    categories: ALL_CATEGORY_SLUGS.length,
    gameTypes: Object.keys(GAME_TYPE_META).length,
    users: CONTENT_USERS.length + FIXTURE_USERS.length,
    content,
    learningEvents: eventCount,
  };
}

async function main(): Promise<void> {
  const handle = createDatabase({ max: 1 });
  try {
    const summary = await seedDatabase(handle.db);
    console.log(
      `Seeded ${summary.categories} categories, ${summary.gameTypes} game types, ` +
        `${summary.users} users, ${summary.content.created} new question versions ` +
        `(${summary.content.unchanged} unchanged), ${summary.learningEvents} learning events.`,
    );
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
