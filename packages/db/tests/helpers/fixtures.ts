/**
 * Row builders for the constraint tests.
 *
 * Each helper inserts the minimum needed to reach the constraint under test,
 * so a failing assertion points at that constraint rather than at setup noise.
 */

import { uuidv7, weekKeyUtc } from '@learnarena/core';
import type { Database } from '../../src/client';
import {
  answers,
  categories,
  gameSessions,
  gameTypes,
  learningEvents,
  pointLedger,
  questionVersions,
  questions,
  sessionQuestions,
  users,
} from '../../src/schema/index';

export const NOW = new Date('2026-09-29T12:00:00Z');

/**
 * Usernames must be unique and are limited to 20 characters of [a-z0-9_].
 * A counter is used rather than a slice of the uuid, because uuid v7 begins
 * with a millisecond timestamp — two users built in the same millisecond would
 * collide and fail the test for the wrong reason.
 */
let usernameCounter = 0;

export async function insertUser(
  db: Database,
  overrides: Partial<{ id: string; username: string; displayName: string; timezone: string }> = {},
): Promise<string> {
  const id = overrides.id ?? uuidv7();
  usernameCounter += 1;
  await db.insert(users).values({
    id,
    username: overrides.username ?? `test_user_${usernameCounter}`,
    displayName: overrides.displayName ?? 'Test User',
    timezone: overrides.timezone ?? 'UTC',
    ageConfirmedAt: NOW,
    onboardingCompletedAt: NOW,
  });
  return id;
}

export async function insertCategory(db: Database, slug = 'math'): Promise<string> {
  const id = uuidv7();
  await db
    .insert(categories)
    .values({ id, slug, name: slug, status: 'LAUNCH' })
    .onConflictDoNothing();
  const row = await db.query.categories.findFirst({
    where: (table, { eq }) => eq(table.slug, slug),
  });
  return row!.id;
}

export async function insertGameType(db: Database, slug = 'quiz_solo'): Promise<string> {
  const id = uuidv7();
  await db
    .insert(gameTypes)
    .values({ id, slug, name: slug, mode: 'SOLO', status: 'ENABLED' })
    .onConflictDoNothing();
  const row = await db.query.gameTypes.findFirst({
    where: (table, { eq }) => eq(table.slug, slug),
  });
  return row!.id;
}

export async function insertQuestion(db: Database, externalId = `q-${uuidv7()}`): Promise<string> {
  const id = uuidv7();
  await db.insert(questions).values({ id, externalId });
  return id;
}

export interface QuestionVersionOverrides {
  questionId: string;
  categoryId: string;
  versionNumber?: number;
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'LIVE' | 'ARCHIVED';
  difficulty?: number;
  authorId?: string | null;
  reviewedBy?: string | null;
  contentHash?: string;
}

export async function insertQuestionVersion(
  db: Database,
  overrides: QuestionVersionOverrides,
): Promise<string> {
  const id = uuidv7();
  const difficulty = overrides.difficulty ?? 3;
  await db.insert(questionVersions).values({
    id,
    questionId: overrides.questionId,
    versionNumber: overrides.versionNumber ?? 1,
    status: overrides.status ?? 'LIVE',
    origin: 'DEV_SEED',
    type: 'MCQ',
    categoryId: overrides.categoryId,
    prompt: 'Test prompt?',
    optionsJson: [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
    ],
    answerJson: { correctOptionId: 'a' },
    explanation: 'A sufficiently long explanation for the schema.',
    difficulty,
    // Deliberately not ratingForDifficulty(): that helper throws for an
    // out-of-range difficulty, and these tests need the *database* CHECK to be
    // what rejects the row.
    rating: (700 + 100 * difficulty).toFixed(2),
    contentHash: overrides.contentHash ?? id,
    authorId: overrides.authorId ?? null,
    reviewedBy: overrides.reviewedBy ?? null,
  });
  return id;
}

export interface SessionOverrides {
  ownerId: string;
  gameTypeId: string;
  categoryId: string;
  status?: 'CREATED' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED' | 'CANCELLED';
  mode?: 'SOLO' | 'COOP' | 'VERSUS';
}

export async function insertSession(db: Database, overrides: SessionOverrides): Promise<string> {
  const id = uuidv7();
  await db.insert(gameSessions).values({
    id,
    gameTypeId: overrides.gameTypeId,
    mode: overrides.mode ?? 'SOLO',
    categoryId: overrides.categoryId,
    ownerId: overrides.ownerId,
    status: overrides.status ?? 'ACTIVE',
    weaknessTier: 'NONE',
    weaknessSnapshotJson: {},
    questionCount: 10,
    timeLimitMs: 20_000,
    creationIdempotencyKey: uuidv7(),
    createdAt: NOW,
  });
  return id;
}

export async function insertSessionQuestion(
  db: Database,
  sessionId: string,
  questionVersionId: string,
  position: number,
): Promise<void> {
  await db.insert(sessionQuestions).values({ sessionId, position, questionVersionId });
}

export interface AnswerOverrides {
  sessionId: string;
  userId: string;
  questionVersionId: string;
  position?: number;
  correctness?: string;
  speedFactor?: string;
}

export async function insertAnswer(db: Database, overrides: AnswerOverrides): Promise<string> {
  const id = uuidv7();
  await db.insert(answers).values({
    id,
    sessionId: overrides.sessionId,
    userId: overrides.userId,
    questionVersionId: overrides.questionVersionId,
    position: overrides.position ?? 0,
    outcome: 'ANSWERED',
    correctness: overrides.correctness ?? '1.000',
    speedFactor: overrides.speedFactor ?? '0.7500',
    serverReceivedAt: NOW,
  });
  return id;
}

export interface LearningEventOverrides {
  userId: string;
  sessionId: string;
  gameTypeId: string;
  categoryId: string;
  sourceKey: string;
  answerId?: string;
  correctness?: string;
}

export async function insertLearningEvent(
  db: Database,
  overrides: LearningEventOverrides,
): Promise<string> {
  const id = uuidv7();
  await db.insert(learningEvents).values({
    id,
    userId: overrides.userId,
    sessionId: overrides.sessionId,
    gameTypeId: overrides.gameTypeId,
    categoryId: overrides.categoryId,
    sourceKey: overrides.sourceKey,
    answerId: overrides.answerId ?? null,
    difficultyRating: '1000.00',
    correctness: overrides.correctness ?? '1.000',
    timedOut: false,
    occurredAt: NOW,
  });
  return id;
}

export interface LedgerOverrides {
  userId: string;
  sessionId?: string;
  finalPoints?: number;
  idempotencyKey?: string;
  weekKey?: string;
  reason?: 'SESSION_COMPLETION' | 'DAILY_CHALLENGE_BONUS' | 'ACHIEVEMENT' | 'ADJUSTMENT';
  adjustsLedgerId?: string;
}

export async function insertLedgerRow(db: Database, overrides: LedgerOverrides): Promise<string> {
  const id = uuidv7();
  await db.insert(pointLedger).values({
    id,
    userId: overrides.userId,
    sessionId: overrides.sessionId ?? null,
    reason: overrides.reason ?? 'SESSION_COMPLETION',
    rawBasePoints: '800.0000',
    comboAdjustedPoints: '968.7500',
    multipliersJson: { streak: 1.1, weakness: 1.5 },
    uncappedPoints: '1598.4375',
    capApplied: false,
    finalPoints: overrides.finalPoints ?? 1598,
    weekKey: overrides.weekKey ?? weekKeyUtc(NOW),
    idempotencyKey: overrides.idempotencyKey ?? `session:${id}:SESSION_COMPLETION`,
    adjustsLedgerId: overrides.adjustsLedgerId ?? null,
    createdAt: NOW,
  });
  return id;
}
