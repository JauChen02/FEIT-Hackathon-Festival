import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { contentOriginEnum, contentStatusEnum, answerOutcomeEnum } from './enums';
import { users } from './identity';
import { gameSessions } from './sessions';
import { categories } from './taxonomy';
export const soloActivityKindEnum = pgEnum('solo_activity_kind', [
  'speed_math',
  'memory_match',
  'dialogue_scenario',
]);
export const activityVersions = pgTable(
  'activity_versions',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    versionNumber: integer('version_number').notNull(),
    kind: soloActivityKindEnum('kind').notNull(),
    name: text('name').notNull(),
    status: contentStatusEnum('status').notNull(),
    origin: contentOriginEnum('origin').notNull(),
    contentJson: jsonb('content_json').notNull(),
    contentHash: text('content_hash').notNull(),
    source: text('source').notNull().default('Development fixture'),
    license: text('license').notNull().default('Development only'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    authorId: uuid('author_id').references(() => users.id),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('activity_version_unique').on(t.slug, t.versionNumber)],
);
export const activitySessions = pgTable('activity_sessions', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => gameSessions.id),
  versionId: uuid('version_id')
    .notNull()
    .references(() => activityVersions.id),
  seed: text('seed').notNull(),
  nodeId: text('node_id'),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  finished: boolean('finished').notNull().default(false),
  bestEnding: boolean('best_ending').notNull().default(false),
});
export const activityAssessments = pgTable(
  'activity_assessments',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    position: integer('position').notNull(),
    sourceKey: text('source_key').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    prompt: text('prompt').notNull(),
    optionsJson: jsonb('options_json'),
    answerJson: jsonb('answer_json').notNull(),
    explanation: text('explanation').notNull(),
    rating: numeric('rating', { precision: 7, scale: 2 }).notNull(),
    servedAt: timestamp('served_at', { withTimezone: true }).notNull(),
    revealUntil: timestamp('reveal_until', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    outcome: answerOutcomeEnum('outcome'),
    responseJson: jsonb('response_json'),
    correctness: numeric('correctness', { precision: 4, scale: 3 }),
    speedFactor: numeric('speed_factor', { precision: 5, scale: 4 }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resultJson: jsonb('result_json'),
  },
  (t) => [
    unique('activity_assessment_source_unique').on(t.sessionId, t.userId, t.sourceKey),
    unique('activity_assessment_position_unique').on(t.sessionId, t.position),
  ],
);
