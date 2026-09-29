/**
 * Every MVP database constraint, verified by attempting the violation.
 *
 * Phase 0 acceptance criterion (§24): "all MVP constraints exist (verified by an
 * integration test that attempts each violation: duplicate username, two LIVE
 * versions of one question, reviewer = author, point_ledger UPDATE/DELETE,
 * correctness outside 0..1)."
 *
 * The five named cases are marked below. The rest are here because §25.6 asks
 * every phase to preserve the system invariants, and a constraint that exists
 * only in the Drizzle DSL but never reached SQL would be invisible otherwise.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from '@learnarena/core';
import { PG_ERROR_CODES } from '../src/errors';
import {
  MVP_TABLE_NAMES,
  ALPHA_TABLE_NAMES,
  gameSessions,
  learningEvents,
  pointLedger,
  questionVersions,
  recommendations,
  skillUpdates,
  streakDays,
  streakFreezes,
  users,
} from '../src/schema/index';
import { createTestDatabase, expectPgError, type TestDatabase } from './helpers/database';
import {
  insertAnswer,
  insertCategory,
  insertGameType,
  insertLearningEvent,
  insertLedgerRow,
  insertQuestion,
  insertQuestionVersion,
  insertSession,
  insertSessionQuestion,
  insertUser,
} from './helpers/fixtures';

let ctx: TestDatabase;
let categoryId: string;
let gameTypeId: string;

beforeAll(async () => {
  ctx = await createTestDatabase('constraints');
  categoryId = await insertCategory(ctx.db);
  gameTypeId = await insertGameType(ctx.db);
});

afterAll(async () => {
  await ctx?.drop();
});

describe('users', () => {
  // §24 named case 1.
  it('rejects a duplicate username', async () => {
    await insertUser(ctx.db, { username: 'alex_01' });
    const error = await expectPgError(() => insertUser(ctx.db, { username: 'alex_01' }));
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
  });

  it('matches usernames case-insensitively, because the column is citext', async () => {
    // This is what makes `409 USERNAME_TAKEN` correct: the API lowercases input
    // before inserting, and a lookup for any casing finds the stored row.
    const id = await insertUser(ctx.db, { username: 'casetest' });
    const found = await ctx.db.select().from(users).where(eq(users.username, 'CaseTest'));
    expect(found.map((row) => row.id)).toEqual([id]);
  });

  it.each([
    ['ab', 'shorter than 3', 'users_username_length'],
    ['a'.repeat(21), 'longer than 20', 'users_username_length'],
    ['Alex', 'uppercase', 'users_username_charset'],
    ['alex-01', 'a hyphen', 'users_username_charset'],
    ['alex 01', 'a space', 'users_username_charset'],
  ])('rejects the username %j (%s)', async (username, _why, constraint) => {
    const error = await expectPgError(() => insertUser(ctx.db, { username }));
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe(constraint);
  });

  it('rejects a blank timezone', async () => {
    const error = await expectPgError(() => insertUser(ctx.db, { timezone: '   ' }));
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('users_timezone_not_blank');
  });
});

describe('question_versions', () => {
  // §24 named case 2.
  it('rejects a second LIVE version of the same question', async () => {
    const questionId = await insertQuestion(ctx.db);
    await insertQuestionVersion(ctx.db, { questionId, categoryId, versionNumber: 1 });

    const error = await expectPgError(() =>
      insertQuestionVersion(ctx.db, { questionId, categoryId, versionNumber: 2 }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('one_live_version');
  });

  it('allows many ARCHIVED versions alongside one LIVE version', async () => {
    const questionId = await insertQuestion(ctx.db);
    await insertQuestionVersion(ctx.db, {
      questionId,
      categoryId,
      versionNumber: 1,
      status: 'ARCHIVED',
    });
    await insertQuestionVersion(ctx.db, {
      questionId,
      categoryId,
      versionNumber: 2,
      status: 'ARCHIVED',
    });
    await expect(
      insertQuestionVersion(ctx.db, { questionId, categoryId, versionNumber: 3, status: 'LIVE' }),
    ).resolves.toBeTruthy();
  });

  // §24 named case 3.
  it('rejects reviewed_by equal to author_id (§13.1)', async () => {
    const authorId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);

    const error = await expectPgError(() =>
      insertQuestionVersion(ctx.db, {
        questionId,
        categoryId,
        authorId,
        reviewedBy: authorId,
        status: 'DRAFT',
      }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('question_versions_reviewer_not_author');
  });

  it('allows a reviewer who is a different user', async () => {
    const authorId = await insertUser(ctx.db);
    const reviewerId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);
    await expect(
      insertQuestionVersion(ctx.db, {
        questionId,
        categoryId,
        authorId,
        reviewedBy: reviewerId,
        status: 'DRAFT',
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects a duplicate version number for one question', async () => {
    const questionId = await insertQuestion(ctx.db);
    await insertQuestionVersion(ctx.db, {
      questionId,
      categoryId,
      versionNumber: 1,
      status: 'DRAFT',
    });
    const error = await expectPgError(() =>
      insertQuestionVersion(ctx.db, {
        questionId,
        categoryId,
        versionNumber: 1,
        status: 'DRAFT',
      }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('question_versions_question_version_unique');
  });

  it.each([0, 6, -1])('rejects difficulty %i (must be 1..5)', async (difficulty) => {
    const questionId = await insertQuestion(ctx.db);
    const error = await expectPgError(() =>
      insertQuestionVersion(ctx.db, { questionId, categoryId, difficulty, status: 'DRAFT' }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('question_versions_difficulty_range');
  });

  it('refuses to delete a version an answer references (§13.2)', async () => {
    const userId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);
    const versionId = await insertQuestionVersion(ctx.db, {
      questionId,
      categoryId,
      status: 'ARCHIVED',
    });
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    await insertSessionQuestion(ctx.db, sessionId, versionId, 0);
    await insertAnswer(ctx.db, { sessionId, userId, questionVersionId: versionId });

    const error = await expectPgError(() =>
      ctx.db.delete(questionVersions).where(eq(questionVersions.id, versionId)),
    );
    expect(error.code).toBe(PG_ERROR_CODES.FOREIGN_KEY_VIOLATION);
  });
});

describe('game_sessions', () => {
  it('rejects a second open solo session for the same owner (§8.1, ADR-012)', async () => {
    const ownerId = await insertUser(ctx.db);
    await insertSession(ctx.db, { ownerId, gameTypeId, categoryId, status: 'ACTIVE' });

    const error = await expectPgError(() =>
      insertSession(ctx.db, { ownerId, gameTypeId, categoryId, status: 'CREATED' }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('one_open_solo_session');
  });

  it('allows a new session once the previous one is terminal', async () => {
    const ownerId = await insertUser(ctx.db);
    await insertSession(ctx.db, { ownerId, gameTypeId, categoryId, status: 'COMPLETED' });
    await insertSession(ctx.db, { ownerId, gameTypeId, categoryId, status: 'ABANDONED' });
    await expect(
      insertSession(ctx.db, { ownerId, gameTypeId, categoryId, status: 'ACTIVE' }),
    ).resolves.toBeTruthy();
  });

  it('rejects a reused idempotency key for the same owner (§18.1)', async () => {
    const ownerId = await insertUser(ctx.db);
    const key = uuidv7();
    const insert = (status: 'COMPLETED' | 'ABANDONED') =>
      ctx.db.insert(gameSessions).values({
        id: uuidv7(),
        gameTypeId,
        mode: 'SOLO',
        categoryId,
        ownerId,
        status,
        weaknessTier: 'NONE',
        weaknessSnapshotJson: {},
        creationIdempotencyKey: key,
      });

    await insert('COMPLETED');
    const error = await expectPgError(() => insert('ABANDONED'));
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('game_sessions_owner_idempotency_unique');
  });
});

describe('answers', () => {
  // §24 named case 5 (answers half).
  it.each(['1.500', '-0.100'])('rejects correctness %s (must be 0..1)', async (correctness) => {
    const userId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);
    const versionId = await insertQuestionVersion(ctx.db, { questionId, categoryId });
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });

    const error = await expectPgError(() =>
      insertAnswer(ctx.db, { sessionId, userId, questionVersionId: versionId, correctness }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('answers_correctness_range');
  });

  it('accepts the boundary values 0 and 1', async () => {
    const userId = await insertUser(ctx.db);
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    for (const correctness of ['0.000', '1.000']) {
      const questionId = await insertQuestion(ctx.db);
      const versionId = await insertQuestionVersion(ctx.db, { questionId, categoryId });
      await expect(
        insertAnswer(ctx.db, { sessionId, userId, questionVersionId: versionId, correctness }),
      ).resolves.toBeTruthy();
    }
  });

  it('rejects a second answer to the same question in one session (§18.1)', async () => {
    const userId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);
    const versionId = await insertQuestionVersion(ctx.db, { questionId, categoryId });
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });

    await insertAnswer(ctx.db, { sessionId, userId, questionVersionId: versionId });
    const error = await expectPgError(() =>
      insertAnswer(ctx.db, { sessionId, userId, questionVersionId: versionId, position: 1 }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('answers_session_user_version_unique');
  });
});

describe('learning_events', () => {
  // §24 named case 5 (learning_events half).
  it.each(['1.500', '-0.100'])('rejects correctness %s (must be 0..1)', async (correctness) => {
    const userId = await insertUser(ctx.db);
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });

    const error = await expectPgError(() =>
      insertLearningEvent(ctx.db, {
        userId,
        sessionId,
        gameTypeId,
        categoryId,
        sourceKey: 'k',
        correctness,
      }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('learning_events_correctness_range');
  });

  it('rejects two events with the same source key in one session (§9)', async () => {
    const userId = await insertUser(ctx.db);
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    await insertLearningEvent(ctx.db, {
      userId,
      sessionId,
      gameTypeId,
      categoryId,
      sourceKey: 'position-0',
    });

    const error = await expectPgError(() =>
      insertLearningEvent(ctx.db, {
        userId,
        sessionId,
        gameTypeId,
        categoryId,
        sourceKey: 'position-0',
      }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('learning_events_session_user_source_unique');
  });

  it('rejects two events pointing at the same answer (§18.1)', async () => {
    const userId = await insertUser(ctx.db);
    const questionId = await insertQuestion(ctx.db);
    const versionId = await insertQuestionVersion(ctx.db, { questionId, categoryId });
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    const answerId = await insertAnswer(ctx.db, {
      sessionId,
      userId,
      questionVersionId: versionId,
    });

    await insertLearningEvent(ctx.db, {
      userId,
      sessionId,
      gameTypeId,
      categoryId,
      sourceKey: 'a',
      answerId,
    });
    const error = await expectPgError(() =>
      insertLearningEvent(ctx.db, {
        userId,
        sessionId,
        gameTypeId,
        categoryId,
        sourceKey: 'b',
        answerId,
      }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
  });

  it('allows many events with a NULL answer id', async () => {
    const userId = await insertUser(ctx.db);
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    for (const sourceKey of ['n1', 'n2', 'n3']) {
      await insertLearningEvent(ctx.db, {
        userId,
        sessionId,
        gameTypeId,
        categoryId,
        sourceKey,
      });
    }
    const rows = await ctx.db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.sessionId, sessionId));
    expect(rows).toHaveLength(3);
  });
});

describe('point_ledger', () => {
  // §24 named case 4. Invariant 3: the ledger is append-only.
  it('rejects UPDATE', async () => {
    const userId = await insertUser(ctx.db);
    const ledgerId = await insertLedgerRow(ctx.db, { userId });

    const error = await expectPgError(() =>
      ctx.db.update(pointLedger).set({ finalPoints: 99_999 }).where(eq(pointLedger.id, ledgerId)),
    );
    expect(error.code).toBe(PG_ERROR_CODES.RESTRICT_VIOLATION);
    expect(error.message).toMatch(/append-only/);
  });

  it('rejects DELETE', async () => {
    const userId = await insertUser(ctx.db);
    const ledgerId = await insertLedgerRow(ctx.db, { userId });

    const error = await expectPgError(() =>
      ctx.db.delete(pointLedger).where(eq(pointLedger.id, ledgerId)),
    );
    expect(error.code).toBe(PG_ERROR_CODES.RESTRICT_VIOLATION);
    expect(error.message).toMatch(/append-only/);
  });

  it('rejects a bulk UPDATE that would touch many rows', async () => {
    const userId = await insertUser(ctx.db);
    await insertLedgerRow(ctx.db, { userId });
    await insertLedgerRow(ctx.db, { userId });

    const error = await expectPgError(() => ctx.db.update(pointLedger).set({ capApplied: true }));
    expect(error.code).toBe(PG_ERROR_CODES.RESTRICT_VIOLATION);
  });

  it('leaves the row untouched after a rejected UPDATE', async () => {
    const userId = await insertUser(ctx.db);
    const ledgerId = await insertLedgerRow(ctx.db, { userId, finalPoints: 1598 });
    await expectPgError(() =>
      ctx.db.update(pointLedger).set({ finalPoints: 1 }).where(eq(pointLedger.id, ledgerId)),
    );

    const rows = await ctx.db.select().from(pointLedger).where(eq(pointLedger.id, ledgerId));
    expect(rows[0]?.finalPoints).toBe(1598);
  });

  it('accepts a correcting ADJUSTMENT row, which is how errors are fixed (§10.4)', async () => {
    const userId = await insertUser(ctx.db);
    const original = await insertLedgerRow(ctx.db, { userId, finalPoints: 1598 });
    await expect(
      insertLedgerRow(ctx.db, {
        userId,
        finalPoints: -98,
        reason: 'ADJUSTMENT',
        adjustsLedgerId: original,
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects an ADJUSTMENT row that names no target', async () => {
    const userId = await insertUser(ctx.db);
    const error = await expectPgError(() =>
      insertLedgerRow(ctx.db, { userId, reason: 'ADJUSTMENT' }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
    expect(error.constraint).toBe('point_ledger_adjustment_target');
  });

  it('rejects a duplicate idempotency key (§18.1)', async () => {
    const userId = await insertUser(ctx.db);
    await insertLedgerRow(ctx.db, { userId, idempotencyKey: 'session:x:SESSION_COMPLETION' });

    const error = await expectPgError(() =>
      insertLedgerRow(ctx.db, { userId, idempotencyKey: 'session:x:SESSION_COMPLETION' }),
    );
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
  });

  it.each(['2026-W1', '26-W01', 'not-a-week'])(
    'rejects the malformed week key %s',
    async (weekKey) => {
      const userId = await insertUser(ctx.db);
      const error = await expectPgError(() => insertLedgerRow(ctx.db, { userId, weekKey }));
      expect(error.code).toBe(PG_ERROR_CODES.CHECK_VIOLATION);
      expect(error.constraint).toBe('point_ledger_week_key_format');
    },
  );
});

describe('coach and streak uniqueness', () => {
  it('rejects two recommendations for one user on one local date (§11.5)', async () => {
    const userId = await insertUser(ctx.db);
    const insert = () =>
      ctx.db.insert(recommendations).values({
        id: uuidv7(),
        userId,
        localDate: '2026-09-29',
        categoryId,
        gameTypeId,
        targetRating: '853.00',
        status: 'AVAILABLE',
        reasonJson: {},
      });

    await insert();
    const error = await expectPgError(insert);
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('recommendations_user_local_date_unique');
  });

  it('rejects two streak days for one user on one local date (§12.1)', async () => {
    const userId = await insertUser(ctx.db);
    const insert = () =>
      ctx.db.insert(streakDays).values({ userId, localDate: '2026-09-29', source: 'PLAYED' });

    await insert();
    const error = await expectPgError(insert);
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
  });

  it('rejects two freezes earned by one user on one local date (§12.1)', async () => {
    const userId = await insertUser(ctx.db);
    const insert = () =>
      ctx.db.insert(streakFreezes).values({
        id: uuidv7(),
        userId,
        status: 'AVAILABLE',
        earnedOnLocalDate: '2026-09-29',
      });

    await insert();
    const error = await expectPgError(insert);
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
    expect(error.constraint).toBe('streak_freezes_user_earned_unique');
  });

  it('rejects two skill updates for one learning event (§11.3)', async () => {
    const userId = await insertUser(ctx.db);
    const sessionId = await insertSession(ctx.db, { ownerId: userId, gameTypeId, categoryId });
    const eventId = await insertLearningEvent(ctx.db, {
      userId,
      sessionId,
      gameTypeId,
      categoryId,
      sourceKey: 'su-1',
    });
    const insert = () =>
      ctx.db.insert(skillUpdates).values({
        id: uuidv7(),
        learningEventId: eventId,
        userId,
        categoryId,
        ratingBefore: '1000.00',
        ratingAfter: '1016.00',
        expected: '0.50000',
        kFactor: 32,
      });

    await insert();
    const error = await expectPgError(insert);
    expect(error.code).toBe(PG_ERROR_CODES.UNIQUE_VIOLATION);
  });
});

describe('row level security (§14.1)', () => {
  it('enables RLS on every MVP table', async () => {
    const rows = await ctx.db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`,
    );
    expect(rows.map((row) => row.tablename).sort()).toEqual([]);
  });

  it('covers exactly the 21 MVP tables', async () => {
    const rows = await ctx.db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and rowsecurity`,
    );
    expect(rows.map((row) => row.tablename).sort()).toEqual(
      [...MVP_TABLE_NAMES, ...ALPHA_TABLE_NAMES].sort(),
    );
  });

  it('defines no policies, which is what makes RLS deny-all', async () => {
    const rows = await ctx.db.execute<{ policyname: string }>(
      sql`select policyname from pg_policies where schemaname = 'public'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('soft deletes (§14.1)', () => {
  it('keeps canonical history when a user is soft-deleted', async () => {
    const userId = await insertUser(ctx.db);
    await insertLedgerRow(ctx.db, { userId });

    await ctx.db
      .update(users)
      .set({ deletedAt: new Date('2026-09-29T00:00:00Z') })
      .where(eq(users.id, userId));

    const ledger = await ctx.db.select().from(pointLedger).where(eq(pointLedger.userId, userId));
    expect(ledger).toHaveLength(1);
  });

  it('refuses to hard-delete a user with canonical history', async () => {
    const userId = await insertUser(ctx.db);
    await insertLedgerRow(ctx.db, { userId });

    const error = await expectPgError(() => ctx.db.delete(users).where(eq(users.id, userId)));
    expect(error.code).toBe(PG_ERROR_CODES.FOREIGN_KEY_VIOLATION);
  });
});
