/**
 * `pnpm content:import` — the MVP content pipeline (PLANNING.md §13.4, ADR-020).
 *
 * "Content is authored as JSON files in `content/` in the repo. Review happens
 *  through pull request. An idempotent import command upserts by
 *  (question_external_id, version_number), records `reviewed_by` from the file's
 *  metadata, and publishes to LIVE. The command refuses to modify an existing
 *  version whose content hash differs (it must be a new version)."
 *
 * Properties this command guarantees:
 *   - **Validate everything before writing anything.** A malformed file aborts
 *     the run with nothing committed, so a bad PR cannot half-publish.
 *   - **Idempotent.** A second run over unchanged files performs zero writes:
 *     no rows, no audit entries, no `updated_at` bumps.
 *   - **Immutable published versions** (§13.2, ADR-008). Same version number
 *     plus a different content hash is an error, never an update.
 *   - **Audited.** Every status transition writes a `content_audit_log` row
 *     (§13.3), walked through the real state machine in @learnarena/core.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, ne } from 'drizzle-orm';
import {
  contentFileSchema,
  contentHash,
  contentTransitions,
  expectedContentFileName,
  IMPORT_PUBLISH_PATH,
  ratingForDifficulty,
  uuidv7,
  type ContentFile,
  type ContentStatus,
} from '@learnarena/core';
import type { Database } from '../client';
import { categories, contentAuditLog, questionVersions, questions, users } from '../schema/index';

export class ContentImportError extends Error {
  readonly file: string | undefined;

  constructor(message: string, file?: string) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'ContentImportError';
    this.file = file;
  }
}

export type ContentImportOutcome = 'created' | 'unchanged';

export interface ContentImportResult {
  file: string;
  externalId: string;
  versionNumber: number;
  outcome: ContentImportOutcome;
  /** The previously LIVE version this import archived, if any. */
  archivedVersionNumber?: number;
}

export interface ContentImportSummary {
  created: number;
  unchanged: number;
  archived: number;
  results: ContentImportResult[];
}

export interface ImportContentOptions {
  /** Directory to scan recursively for `*.json`. */
  dir: string;
  /** Validate and report without writing. */
  dryRun?: boolean;
  /** Refuse files whose origin is in this set (used to keep DEV_SEED out of prod). */
  forbiddenOrigins?: readonly ContentFile['origin'][];
}

/** Recursively collect `*.json` paths, sorted, so runs are deterministic. */
async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${path.sep}activities${path.sep}`))
    .sort();
}

interface ParsedFile {
  relativePath: string;
  file: ContentFile;
  rating: number;
  hash: string;
}

/**
 * Phase 1: read, validate and hash every file. Throws on the first problem,
 * before any transaction is opened.
 */
async function parseAll(options: ImportContentOptions): Promise<ParsedFile[]> {
  const absolutePaths = await collectJsonFiles(options.dir);
  const parsed: ParsedFile[] = [];
  const seen = new Map<string, string>();

  for (const absolutePath of absolutePaths) {
    const relativePath = path.relative(options.dir, absolutePath);

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(absolutePath, 'utf8'));
    } catch (error) {
      throw new ContentImportError(
        `not valid JSON (${error instanceof Error ? error.message : String(error)})`,
        relativePath,
      );
    }

    const result = contentFileSchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const location = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      throw new ContentImportError(`${location}: ${issue.message}`, relativePath);
    }
    const file = result.data;

    // The filename encodes the identity, so a copy-paste that forgets to bump
    // the version number is caught here rather than becoming a silent no-op.
    const expectedName = expectedContentFileName(file);
    if (path.basename(relativePath) !== expectedName) {
      throw new ContentImportError(
        `filename must match its contents: expected "${expectedName}"`,
        relativePath,
      );
    }

    if (options.forbiddenOrigins?.includes(file.origin)) {
      throw new ContentImportError(
        `origin ${file.origin} is not importable in this environment`,
        relativePath,
      );
    }

    const key = `${file.externalId}@${file.versionNumber}`;
    const duplicate = seen.get(key);
    if (duplicate) {
      throw new ContentImportError(
        `duplicates ${key}, already declared by ${duplicate}`,
        relativePath,
      );
    }
    seen.set(key, relativePath);

    const rating = ratingForDifficulty(file.difficulty);
    parsed.push({
      relativePath,
      file,
      rating,
      hash: contentHash({
        type: file.type,
        prompt: file.prompt,
        optionsJson: file.type === 'MCQ' ? file.options : null,
        answerJson: file.answer,
        explanation: file.explanation,
        categorySlug: file.category,
        subTopic: file.subTopic ?? null,
        difficulty: file.difficulty,
        rating,
      }),
    });
  }

  // Import lower version numbers first so v2 archives a v1 that this same run
  // created, rather than racing it.
  return parsed.sort(
    (a, b) =>
      a.file.externalId.localeCompare(b.file.externalId) ||
      a.file.versionNumber - b.file.versionNumber,
  );
}

type ActorLookup = Map<string, string>;

async function resolveActors(db: Database, parsed: readonly ParsedFile[]): Promise<ActorLookup> {
  const usernames = new Set<string>();
  for (const { file } of parsed) {
    usernames.add(file.authorUsername);
    usernames.add(file.reviewedByUsername);
  }
  if (usernames.size === 0) return new Map();

  const rows = await db.select({ id: users.id, username: users.username }).from(users);
  const byUsername: ActorLookup = new Map(rows.map((row) => [row.username, row.id]));

  for (const { relativePath, file } of parsed) {
    for (const username of [file.authorUsername, file.reviewedByUsername]) {
      if (!byUsername.has(username)) {
        throw new ContentImportError(
          `unknown user "${username}". Run \`pnpm db:seed\` to create the content users, ` +
            `or fix the metadata.`,
          relativePath,
        );
      }
    }
  }
  return byUsername;
}

async function resolveCategories(
  db: Database,
  parsed: readonly ParsedFile[],
): Promise<Map<string, string>> {
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));

  for (const { relativePath, file } of parsed) {
    if (!bySlug.has(file.category)) {
      throw new ContentImportError(
        `unknown category "${file.category}". Run \`pnpm db:seed\` first.`,
        relativePath,
      );
    }
  }
  return bySlug;
}

/**
 * Walk DRAFT → IN_REVIEW → APPROVED → LIVE through the real state machine,
 * writing one audit row per step (§13.3, §15.7).
 */
async function publish(
  tx: Database,
  versionId: string,
  reviewerId: string,
  reviewedAt: Date,
  note: string,
): Promise<void> {
  let from: ContentStatus = 'DRAFT';
  for (const to of IMPORT_PUBLISH_PATH) {
    contentTransitions.assertTransition(from, to);
    await tx
      .update(questionVersions)
      .set({
        status: to,
        ...(to === 'APPROVED' ? { reviewedBy: reviewerId, reviewedAt } : {}),
        ...(to === 'LIVE' ? { publishedAt: reviewedAt } : {}),
        updatedAt: reviewedAt,
      })
      .where(and(eq(questionVersions.id, versionId), eq(questionVersions.status, from)));

    await tx.insert(contentAuditLog).values({
      id: uuidv7(),
      actorId: reviewerId,
      entityType: 'question_version',
      entityId: versionId,
      fromStatus: from,
      toStatus: to,
      note,
      createdAt: reviewedAt,
    });
    from = to;
  }
}

/**
 * Import every content file under `options.dir`.
 *
 * Each file is imported in its own transaction, but validation for *all* files
 * happens first, so a syntax error in the last file means nothing at all is
 * written.
 */
export async function importContent(
  db: Database,
  options: ImportContentOptions,
): Promise<ContentImportSummary> {
  const parsed = await parseAll(options);
  const actors = await resolveActors(db, parsed);
  const categoryIds = await resolveCategories(db, parsed);

  const summary: ContentImportSummary = { created: 0, unchanged: 0, archived: 0, results: [] };

  for (const entry of parsed) {
    const { file, relativePath, hash, rating } = entry;
    const authorId = actors.get(file.authorUsername)!;
    const reviewerId = actors.get(file.reviewedByUsername)!;
    const categoryId = categoryIds.get(file.category)!;
    const reviewedAt = new Date(file.reviewedAt);

    const existingVersion = await db
      .select({
        id: questionVersions.id,
        contentHash: questionVersions.contentHash,
        status: questionVersions.status,
      })
      .from(questionVersions)
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(
        and(
          eq(questions.externalId, file.externalId),
          eq(questionVersions.versionNumber, file.versionNumber),
        ),
      )
      .limit(1);

    const found = existingVersion[0];
    if (found) {
      if (found.contentHash !== hash) {
        // §13.2 / ADR-008: published assessment content is immutable.
        throw new ContentImportError(
          `version ${file.versionNumber} already exists with different content ` +
            `(stored hash ${found.contentHash.slice(0, 12)}…, file hash ${hash.slice(0, 12)}…). ` +
            `Published versions are immutable — create version ${file.versionNumber + 1} instead.`,
          relativePath,
        );
      }
      summary.unchanged += 1;
      summary.results.push({
        file: relativePath,
        externalId: file.externalId,
        versionNumber: file.versionNumber,
        outcome: 'unchanged',
      });
      continue;
    }

    if (options.dryRun) {
      summary.created += 1;
      summary.results.push({
        file: relativePath,
        externalId: file.externalId,
        versionNumber: file.versionNumber,
        outcome: 'created',
      });
      continue;
    }

    const result = await db.transaction(async (tx) => {
      const existingQuestion = await tx
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.externalId, file.externalId))
        .limit(1);

      let questionId = existingQuestion[0]?.id;
      if (!questionId) {
        questionId = uuidv7();
        await tx.insert(questions).values({
          id: questionId,
          externalId: file.externalId,
          authorId,
          createdAt: reviewedAt,
        });
      }

      // Archive the current LIVE version, if any, in this same transaction
      // (§13.2). The `one_live_version` partial unique index guarantees there
      // is at most one, and would reject the new LIVE row if this were missed.
      const previousLive = await tx
        .select({ id: questionVersions.id, versionNumber: questionVersions.versionNumber })
        .from(questionVersions)
        .where(
          and(
            eq(questionVersions.questionId, questionId),
            eq(questionVersions.status, 'LIVE'),
            ne(questionVersions.versionNumber, file.versionNumber),
          ),
        )
        .limit(1);

      const archived = previousLive[0];
      if (archived) {
        contentTransitions.assertTransition('LIVE', 'ARCHIVED');
        await tx
          .update(questionVersions)
          .set({ status: 'ARCHIVED', archivedAt: reviewedAt, updatedAt: reviewedAt })
          .where(eq(questionVersions.id, archived.id));
        await tx.insert(contentAuditLog).values({
          id: uuidv7(),
          actorId: reviewerId,
          entityType: 'question_version',
          entityId: archived.id,
          fromStatus: 'LIVE',
          toStatus: 'ARCHIVED',
          note: `Superseded by version ${file.versionNumber} (content:import)`,
          createdAt: reviewedAt,
        });
      }

      const versionId = uuidv7();
      await tx.insert(questionVersions).values({
        id: versionId,
        questionId,
        versionNumber: file.versionNumber,
        status: 'DRAFT',
        origin: file.origin,
        type: file.type,
        categoryId,
        subTopic: file.subTopic ?? null,
        prompt: file.prompt,
        optionsJson: file.type === 'MCQ' ? file.options : null,
        answerJson: file.answer,
        explanation: file.explanation,
        difficulty: file.difficulty,
        rating: rating.toFixed(2),
        source: file.source,
        license: file.license,
        contentHash: hash,
        authorId,
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      });

      await publish(tx, versionId, reviewerId, reviewedAt, `content:import ${relativePath}`);

      return archived?.versionNumber;
    });

    summary.created += 1;
    if (result !== undefined) summary.archived += 1;
    summary.results.push({
      file: relativePath,
      externalId: file.externalId,
      versionNumber: file.versionNumber,
      outcome: 'created',
      ...(result !== undefined ? { archivedVersionNumber: result } : {}),
    });
  }

  return summary;
}
