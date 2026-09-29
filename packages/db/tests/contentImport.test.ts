/**
 * The MVP content pipeline (PLANNING.md §13.4, §24 Phase 0).
 *
 * Acceptance criteria covered:
 *   - "pnpm content:import imports the dev seed"
 *   - "running it twice changes nothing"
 *   - "importing a modified existing version fails with a clear error"
 *   - "audit rows are written"
 *   - "Idempotency: onboarding and content import are re-runnable"
 */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { LAUNCH_CATEGORY_SLUGS, ratingForDifficulty } from '@learnarena/core';
import { ContentImportError, importContent } from '../src/commands/contentImport';
import { DEFAULT_CONTENT_DIR } from '../src/commands/contentImportCli';
import { seedDatabase } from '../src/commands/seed';
import {
  categories,
  contentAuditLog,
  questionVersions,
  questions,
  userRoles,
  users,
} from '../src/schema/index';
import { createTestDatabase, type TestDatabase } from './helpers/database';

let ctx: TestDatabase;
let scratch: string;

const AUTHOR = 'seed_author';
const REVIEWER = 'seed_reviewer';

function fileFor(overrides: Record<string, unknown> = {}) {
  return {
    externalId: 'tmp-question-0001',
    versionNumber: 1,
    category: 'math',
    subTopic: 'arithmetic',
    type: 'MCQ',
    difficulty: 2,
    prompt: 'What is 2 + 2?',
    options: [
      { id: 'a', text: '3' },
      { id: 'b', text: '4' },
    ],
    answer: { correctOptionId: 'b' },
    explanation: 'Two plus two is four; count on from two by two more.',
    origin: 'DEV_SEED',
    source: 'Test fixture',
    license: 'internal',
    authorUsername: AUTHOR,
    reviewedByUsername: REVIEWER,
    reviewedAt: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

/** Write one content file into a fresh scratch directory and return that dir. */
async function writeContentDir(files: Record<string, unknown>[]): Promise<string> {
  const dir = await mkdtemp(path.join(scratch, 'content-'));
  for (const file of files) {
    const category = String(file.category);
    await mkdir(path.join(dir, category), { recursive: true });
    await writeFile(
      path.join(dir, category, `${String(file.externalId)}.v${String(file.versionNumber)}.json`),
      JSON.stringify(file, null, 2),
      'utf8',
    );
  }
  return dir;
}

async function snapshot() {
  const [versions] = await ctx.db.select({ n: count() }).from(questionVersions);
  const [audits] = await ctx.db.select({ n: count() }).from(contentAuditLog);
  const [qs] = await ctx.db.select({ n: count() }).from(questions);
  const updatedAts = await ctx.db
    .select({ id: questionVersions.id, updatedAt: questionVersions.updatedAt })
    .from(questionVersions)
    .orderBy(questionVersions.id);
  return { versions: versions!.n, audits: audits!.n, questions: qs!.n, updatedAts };
}

beforeAll(async () => {
  ctx = await createTestDatabase('content_import');
  scratch = await mkdtemp(path.join(tmpdir(), 'learnarena-content-'));

  // Taxonomy and the content users are prerequisites for any import.
  await seedDatabase(ctx.db, { skipFixtureHistories: true });
});

afterAll(async () => {
  await ctx?.drop();
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

describe('the dev seed (content/)', () => {
  it('publishes 45 LIVE versions — 15 per launch category', async () => {
    const [total] = await ctx.db
      .select({ n: count() })
      .from(questionVersions)
      .where(eq(questionVersions.status, 'LIVE'));
    expect(total!.n).toBe(45);

    for (const slug of LAUNCH_CATEGORY_SLUGS) {
      const rows = await ctx.db
        .select({ difficulty: questionVersions.difficulty })
        .from(questionVersions)
        .innerJoin(categories, eq(categories.id, questionVersions.categoryId))
        .where(eq(categories.slug, slug));

      expect(rows, slug).toHaveLength(15);

      // §13.6: "at least 12 questions covering every difficulty 1 to 5 (≥ 2 per level)".
      const perDifficulty = new Map<number, number>();
      for (const row of rows) {
        perDifficulty.set(row.difficulty, (perDifficulty.get(row.difficulty) ?? 0) + 1);
      }
      for (const difficulty of [1, 2, 3, 4, 5]) {
        expect(
          perDifficulty.get(difficulty) ?? 0,
          `${slug} difficulty ${difficulty}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('derives rating from difficulty rather than trusting the file (ADR-009)', async () => {
    const rows = await ctx.db
      .select({ difficulty: questionVersions.difficulty, rating: questionVersions.rating })
      .from(questionVersions);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number(row.rating), `difficulty ${row.difficulty}`).toBe(
        ratingForDifficulty(row.difficulty),
      );
    }
  });

  it('writes three audit rows per version: IN_REVIEW, APPROVED, LIVE (§13.3)', async () => {
    const [total] = await ctx.db.select({ n: count() }).from(contentAuditLog);
    expect(total!.n).toBe(45 * 3);

    const version = await ctx.db.query.questionVersions.findFirst();
    const trail = await ctx.db
      .select({ from: contentAuditLog.fromStatus, to: contentAuditLog.toStatus })
      .from(contentAuditLog)
      .where(eq(contentAuditLog.entityId, version!.id))
      .orderBy(contentAuditLog.createdAt, contentAuditLog.id);

    expect(trail).toEqual([
      { from: 'DRAFT', to: 'IN_REVIEW' },
      { from: 'IN_REVIEW', to: 'APPROVED' },
      { from: 'APPROVED', to: 'LIVE' },
    ]);
  });

  it('records the reviewer from the file metadata, and it is not the author', async () => {
    const rows = await ctx.db
      .select({
        authorId: questionVersions.authorId,
        reviewedBy: questionVersions.reviewedBy,
        reviewedAt: questionVersions.reviewedAt,
        publishedAt: questionVersions.publishedAt,
      })
      .from(questionVersions);

    for (const row of rows) {
      expect(row.authorId).not.toBeNull();
      expect(row.reviewedBy).not.toBeNull();
      expect(row.reviewedBy).not.toBe(row.authorId);
      expect(row.reviewedAt).not.toBeNull();
      expect(row.publishedAt).not.toBeNull();
    }
  });

  it('gives the content users their AUTHOR and REVIEWER roles (§13.1)', async () => {
    const rows = await ctx.db
      .select({ username: users.username, role: userRoles.role })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .orderBy(users.username);

    expect(rows).toEqual([
      { username: AUTHOR, role: 'AUTHOR' },
      { username: REVIEWER, role: 'REVIEWER' },
    ]);
  });

  // §24: "running it twice changes nothing".
  it('writes nothing at all on a second run', async () => {
    const before = await snapshot();

    const summary = await importContent(ctx.db, { dir: DEFAULT_CONTENT_DIR });

    expect(summary.created).toBe(0);
    expect(summary.archived).toBe(0);
    expect(summary.unchanged).toBe(45);
    expect(await snapshot()).toEqual(before);
  });
});

describe('immutability of published versions (§13.2, ADR-008)', () => {
  // These tests share one database, so each gets its own question identity —
  // otherwise publishing v2 in one test would leak into the next one's setup.
  let externalId: string;
  let testIndex = 0;

  beforeEach(async () => {
    testIndex += 1;
    externalId = `immutability-${testIndex}`;
    const dir = await writeContentDir([fileFor({ externalId })]);
    await importContent(ctx.db, { dir });
  });

  // §24: "importing a modified existing version fails with a clear error".
  it('refuses a same-version file whose assessment content changed', async () => {
    const before = await snapshot();
    const edited = await writeContentDir([fileFor({ externalId, prompt: 'What is 2 + 3?' })]);

    await expect(importContent(ctx.db, { dir: edited })).rejects.toThrow(ContentImportError);
    await expect(importContent(ctx.db, { dir: edited })).rejects.toThrow(
      /Published versions are immutable — create version 2 instead/,
    );
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['the explanation', { explanation: 'A completely different explanation goes here.' }],
    ['the correct answer', { answer: { correctOptionId: 'a' } }],
    ['the difficulty', { difficulty: 4 }],
    [
      'the option order',
      {
        options: [
          { id: 'b', text: '4' },
          { id: 'a', text: '3' },
        ],
      },
    ],
  ])('also refuses a change to %s', async (_label, patch) => {
    const edited = await writeContentDir([fileFor({ externalId, ...patch })]);
    await expect(importContent(ctx.db, { dir: edited })).rejects.toThrow(
      /Published versions are immutable/,
    );
  });

  it('accepts metadata-only edits, which do not change the content hash (ADR-030)', async () => {
    const edited = await writeContentDir([
      fileFor({ externalId, source: 'A revised attribution note', license: 'CC-BY-4.0' }),
    ]);
    const summary = await importContent(ctx.db, { dir: edited });
    expect(summary.unchanged).toBe(1);
    expect(summary.created).toBe(0);
  });

  it('publishes v2 and archives v1 in the same run (§13.2)', async () => {
    const v2 = await writeContentDir([
      fileFor({ externalId, versionNumber: 2, prompt: 'What is 2 + 2, exactly?' }),
    ]);
    const summary = await importContent(ctx.db, { dir: v2 });

    expect(summary.created).toBe(1);
    expect(summary.archived).toBe(1);
    expect(summary.results[0]?.archivedVersionNumber).toBe(1);

    const rows = await ctx.db
      .select({ versionNumber: questionVersions.versionNumber, status: questionVersions.status })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(eq(questions.externalId, externalId))
      .orderBy(questionVersions.versionNumber);

    expect(rows).toEqual([
      { versionNumber: 1, status: 'ARCHIVED' },
      { versionNumber: 2, status: 'LIVE' },
    ]);
  });

  it('writes an audit row for the archival', async () => {
    const v2 = await writeContentDir([
      fileFor({ externalId, versionNumber: 2, prompt: 'Reworded prompt for v2?' }),
    ]);
    await importContent(ctx.db, { dir: v2 });

    const version1 = await ctx.db
      .select({ id: questionVersions.id })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(and(eq(questions.externalId, externalId), eq(questionVersions.versionNumber, 1)))
      .limit(1);

    const archival = await ctx.db
      .select({ from: contentAuditLog.fromStatus, to: contentAuditLog.toStatus })
      .from(contentAuditLog)
      .where(eq(contentAuditLog.entityId, version1[0]!.id));

    expect(archival).toContainEqual({ from: 'LIVE', to: 'ARCHIVED' });
  });
});

describe('validation happens before any write', () => {
  it('rejects the whole run when one file is malformed, writing nothing', async () => {
    const before = await snapshot();
    const dir = await writeContentDir([
      fileFor({ externalId: 'good-question-0001' }),
      fileFor({ externalId: 'bad-question-0001', difficulty: 9 }),
    ]);

    await expect(importContent(ctx.db, { dir })).rejects.toThrow(ContentImportError);
    expect(await snapshot()).toEqual(before);
  });

  it('names the offending file and field', async () => {
    const dir = await writeContentDir([fileFor({ externalId: 'bad-field-0001', difficulty: 9 })]);
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(
      /bad-field-0001\.v1\.json: difficulty:/,
    );
  });

  it('rejects a reviewer who is also the author (§13.1)', async () => {
    const dir = await writeContentDir([
      fileFor({ externalId: 'self-review-0001', reviewedByUsername: AUTHOR }),
    ]);
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(/authored/);
  });

  it('rejects an unknown author', async () => {
    const dir = await writeContentDir([
      fileFor({ externalId: 'ghost-author-0001', authorUsername: 'nobody_here' }),
    ]);
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(/unknown user "nobody_here"/);
  });

  it('rejects an unknown category', async () => {
    const dir = await writeContentDir([
      fileFor({ externalId: 'ghost-cat-0001', category: 'astrology' }),
    ]);
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(/unknown category "astrology"/);
  });

  it('rejects a file whose name does not match its contents', async () => {
    const dir = await mkdtemp(path.join(scratch, 'content-'));
    await mkdir(path.join(dir, 'math'), { recursive: true });
    await writeFile(
      path.join(dir, 'math', 'wrong-name.json'),
      JSON.stringify(fileFor({ externalId: 'right-name-0001' })),
      'utf8',
    );
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(
      /expected "right-name-0001\.v1\.json"/,
    );
  });

  it('rejects malformed JSON', async () => {
    const dir = await mkdtemp(path.join(scratch, 'content-'));
    await mkdir(path.join(dir, 'math'), { recursive: true });
    await writeFile(path.join(dir, 'math', 'broken.v1.json'), '{ not json', 'utf8');
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(/not valid JSON/);
  });

  it('rejects two files claiming the same external id and version', async () => {
    const dir = await mkdtemp(path.join(scratch, 'content-'));
    for (const category of ['math', 'logic']) {
      await mkdir(path.join(dir, category), { recursive: true });
      await writeFile(
        path.join(dir, category, 'dup-question-0001.v1.json'),
        JSON.stringify(fileFor({ externalId: 'dup-question-0001', category })),
        'utf8',
      );
    }
    await expect(importContent(ctx.db, { dir })).rejects.toThrow(/duplicates/);
  });

  it('refuses DEV_SEED content when the environment forbids it (§13.6)', async () => {
    const dir = await writeContentDir([fileFor({ externalId: 'prod-guard-0001' })]);
    await expect(importContent(ctx.db, { dir, forbiddenOrigins: ['DEV_SEED'] })).rejects.toThrow(
      /origin DEV_SEED is not importable/,
    );
  });
});

describe('dry run', () => {
  it('reports what would change without writing', async () => {
    const before = await snapshot();
    const dir = await writeContentDir([fileFor({ externalId: 'dry-run-0001' })]);

    const summary = await importContent(ctx.db, { dir, dryRun: true });

    expect(summary.created).toBe(1);
    expect(await snapshot()).toEqual(before);
  });
});
