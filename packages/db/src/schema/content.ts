/**
 * Content tables (PLANNING.md §14.2, "Content" block; §13 for the rules).
 *
 * `questions` is a stable identity; `question_versions` hold the assessable
 * content and are immutable once they leave DRAFT (§13.2, ADR-008). Answers and
 * learning events reference the version, so historical review always shows
 * exactly what the learner saw (Invariant 11).
 */

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { categories } from './taxonomy';
import { contentOriginEnum, contentStatusEnum, questionTypeEnum } from './enums';

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey(),
  /** Stable, human-authored identity used by the content files (§13.4). */
  externalId: text('external_id').notNull().unique(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      // RESTRICT: versions referenced by answers are never deleted (§13.2).
      .references(() => questions.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    status: contentStatusEnum('status').notNull(),
    origin: contentOriginEnum('origin').notNull(),

    // --- assessment-critical fields: immutable once out of DRAFT (§13.2) ---
    type: questionTypeEnum('type').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subTopic: text('sub_topic'),
    prompt: text('prompt').notNull(),
    optionsJson: jsonb('options_json'),
    answerJson: jsonb('answer_json'),
    explanation: text('explanation').notNull(),
    difficulty: smallint('difficulty').notNull(),
    /** = 700 + 100 × difficulty at creation; fixed in MVP (§11.2, ADR-009). */
    rating: numeric('rating', { precision: 7, scale: 2 }).notNull(),
    // -----------------------------------------------------------------------

    source: text('source'),
    license: text('license'),
    /** SHA-256 over the assessment-critical fields only (ADR-030). */
    contentHash: text('content_hash').notNull(),

    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('question_versions_question_version_unique').on(table.questionId, table.versionNumber),
    check('question_versions_difficulty_range', sql`${table.difficulty} between 1 and 5`),
    // §13.1: "A reviewer MUST NOT approve a version they authored."
    check(
      'question_versions_reviewer_not_author',
      sql`${table.reviewedBy} is null or ${table.reviewedBy} <> ${table.authorId}`,
    ),
    // §13.2: at most one LIVE version per question.
    uniqueIndex('one_live_version')
      .on(table.questionId)
      .where(sql`${table.status} = 'LIVE'`),
    index('question_versions_live_pool_idx')
      .on(table.categoryId, table.rating)
      .where(sql`${table.status} = 'LIVE'`),
  ],
);

/**
 * §13.3: "Every transition writes a content_audit_log row."
 *
 * `entity_type` is plain text rather than an enum — §14.2 declares no enum for
 * it and later entity kinds (scenarios, generator templates) arrive in Alpha
 * (ADR-031).
 */
export const contentAuditLog = pgTable(
  'content_audit_log',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('content_audit_log_entity_idx').on(table.entityType, table.entityId)],
);
