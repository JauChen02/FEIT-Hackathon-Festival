/**
 * Session and answer tables (PLANNING.md §14.2, "Sessions & answers" block).
 *
 * `session_players` exists from MVP even though solo sessions only ever have one
 * player — §"Conventions" allows a minimal interface that avoids a known
 * architectural dead end.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { questionVersions } from './content';
import { recommendations } from './coach';
import {
  answerOutcomeEnum,
  gameModeEnum,
  sessionStatusEnum,
  teamSideEnum,
  weaknessTierEnum,
} from './enums';
import { users } from './identity';
import { categories, gameTypes } from './taxonomy';

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey(),
    gameTypeId: uuid('game_type_id')
      .notNull()
      .references(() => gameTypes.id, { onDelete: 'restrict' }),
    /** Copied from game_types at creation so the partial index below can use it. */
    mode: gameModeEnum('mode').notNull(),
    /** NULL for mixed-category modes (team deathmatch). */
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: sessionStatusEnum('status').notNull(),
    /** Snapshot taken at creation; later skill changes cannot alter it (§11.8). */
    weaknessTier: weaknessTierEnum('weakness_tier').notNull(),
    weaknessSnapshotJson: jsonb('weakness_snapshot_json').notNull(),
    recommendationId: uuid('recommendation_id').references((): AnyPgColumn => recommendations.id, {
      onDelete: 'set null',
    }),
    /** [Alpha] §8.5. The daily_challenges table itself arrives in Phase 4. */
    dailyChallengeId: uuid('daily_challenge_id'),
    questionCount: smallint('question_count'),
    timeLimitMs: integer('time_limit_ms'),
    creationIdempotencyKey: uuid('creation_idempotency_key').notNull(),

    /** Both set on COMPLETED (§18.2 steps 4 and 10). */
    localDate: date('local_date'),
    isQualifying: boolean('is_qualifying'),
    /** Frozen results payload, returned verbatim on an idempotent /complete retry. */
    resultJson: jsonb('result_json'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Set by coach/process-session; NULL marks work for sessions/reconcile (§18.3). */
    postProcessedAt: timestamp('post_processed_at', { withTimezone: true }),
  },
  (table) => [
    unique('game_sessions_owner_idempotency_unique').on(
      table.ownerId,
      table.creationIdempotencyKey,
    ),
    // §8.1 / ADR-012: at most one open solo session per user.
    uniqueIndex('one_open_solo_session')
      .on(table.ownerId)
      .where(sql`${table.status} in ('CREATED','ACTIVE') and ${table.mode} = 'SOLO'`),
    // Drives the hourly sessions/expire-stale sweep (§15.1).
    index('game_sessions_open_activity_idx')
      .on(table.lastActivityAt)
      .where(sql`${table.status} in ('CREATED','ACTIVE')`),
    // Drives the hourly sessions/reconcile job (§18.3).
    index('game_sessions_unprocessed_idx')
      .on(table.endedAt)
      .where(sql`${table.postProcessedAt} is null`),
    index('game_sessions_owner_history_idx').on(table.ownerId, table.createdAt),
  ],
);

export const sessionPlayers = pgTable(
  'session_players',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    team: teamSideEnum('team'),
    placement: smallint('placement'),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);

/** The 10 versions chosen at session creation, in presentation order (§11.6 step 6). */
export const sessionQuestions = pgTable(
  'session_questions',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    /** Server-recorded, so speed factors cannot be client-influenced (§8.1, ADR-011). */
    servedAt: timestamp('served_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.position] }),
    unique('session_questions_session_version_unique').on(table.sessionId, table.questionVersionId),
  ],
);

export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    outcome: answerOutcomeEnum('outcome').notNull(),
    responseJson: jsonb('response_json'),
    correctness: numeric('correctness', { precision: 4, scale: 3 }).notNull(),
    speedFactor: numeric('speed_factor', { precision: 5, scale: 4 }).notNull(),
    responseTimeMs: integer('response_time_ms'),
    /** Canonical (§5.13). */
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }).notNull(),
    /** Advisory diagnostic only (§14.1). */
    clientSentAt: timestamp('client_sent_at', { withTimezone: true }),
  },
  (table) => [
    // Single attempt per question in all modes (§18.1).
    unique('answers_session_user_version_unique').on(
      table.sessionId,
      table.userId,
      table.questionVersionId,
    ),
    check('answers_correctness_range', sql`${table.correctness} between 0 and 1`),
    check('answers_speed_factor_range', sql`${table.speedFactor} between 0 and 1`),
  ],
);

/**
 * §9: the normalized learning event contract. The Coach reads only this table
 * and never game-specific ones (Invariant 9).
 */
export const learningEvents = pgTable(
  'learning_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'restrict' }),
    gameTypeId: uuid('game_type_id')
      .notNull()
      .references(() => gameTypes.id, { onDelete: 'restrict' }),
    /** Unique within (session, user): question_version_id, node id, item index. */
    sourceKey: text('source_key').notNull(),
    questionVersionId: uuid('question_version_id').references(() => questionVersions.id, {
      onDelete: 'restrict',
    }),
    answerId: uuid('answer_id')
      .references(() => answers.id, { onDelete: 'restrict' })
      .unique(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subTopic: text('sub_topic'),
    /** Canonical rating of the item at the time it was served (§9). */
    difficultyRating: numeric('difficulty_rating', { precision: 7, scale: 2 }).notNull(),
    correctness: numeric('correctness', { precision: 4, scale: 3 }).notNull(),
    timedOut: boolean('timed_out').notNull(),
    responseTimeMs: integer('response_time_ms'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // §9: one event per assessed item.
    unique('learning_events_session_user_source_unique').on(
      table.sessionId,
      table.userId,
      table.sourceKey,
    ),
    check('learning_events_correctness_range', sql`${table.correctness} between 0 and 1`),
    // The Coach's read path (§11.4: events in a category over a time window).
    index('learning_events_user_category_time_idx').on(
      table.userId,
      table.categoryId,
      table.occurredAt,
    ),
    index('learning_events_session_idx').on(table.sessionId),
  ],
);
