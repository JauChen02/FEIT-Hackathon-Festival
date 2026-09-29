/**
 * Coach tables (PLANNING.md §14.2, "Coach" block; §11 for the rules).
 *
 * `skill_profiles.rating` is canonical; proficiency, confidence and weakness
 * score are derived at read time and never stored (§11.4, Invariant 5).
 */

import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { gameSessions, learningEvents } from './sessions';
import { recommendationStatusEnum } from './enums';
import { users } from './identity';
import { categories, gameTypes } from './taxonomy';

export const skillProfiles = pgTable(
  'skill_profiles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    /** Canonical Elo rating; starts at 1000 (§11.3). */
    rating: numeric('rating', { precision: 7, scale: 2 }).notNull().default('1000'),
    /** Count *before* the current event; drives the K switch at 50 (§11.3). */
    lifetimeEventCount: integer('lifetime_event_count').notNull().default(0),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.categoryId] })],
);

/**
 * §11.3: "Each application writes a skill_updates row … This row is the audit
 * trail and the idempotency guard." Invariant 5 depends on it.
 */
export const skillUpdates = pgTable(
  'skill_updates',
  {
    id: uuid('id').primaryKey(),
    learningEventId: uuid('learning_event_id')
      .notNull()
      .references(() => learningEvents.id, { onDelete: 'restrict' })
      .unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    ratingBefore: numeric('rating_before', { precision: 7, scale: 2 }).notNull(),
    ratingAfter: numeric('rating_after', { precision: 7, scale: 2 }).notNull(),
    expected: numeric('expected', { precision: 6, scale: 5 }).notNull(),
    kFactor: smallint('k_factor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('skill_updates_user_category_idx').on(table.userId, table.categoryId)],
);

/**
 * §11.5: one recommendation per user per local date, generated lazily on the
 * first GET of that local date. `reason_json` holds the inputs snapshot plus the
 * seed, so the choice stays explainable.
 */
export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    gameTypeId: uuid('game_type_id')
      .notNull()
      .references(() => gameTypes.id, { onDelete: 'restrict' }),
    targetRating: numeric('target_rating', { precision: 7, scale: 2 }).notNull(),
    status: recommendationStatusEnum('status').notNull(),
    reasonJson: jsonb('reason_json').notNull(),
    /** UNIQUE: the ×1.5 bonus can be granted at most once (§11.5, §18.1). */
    completedSessionId: uuid('completed_session_id')
      .references((): AnyPgColumn => gameSessions.id, { onDelete: 'set null' })
      .unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
  },
  (table) => [unique('recommendations_user_local_date_unique').on(table.userId, table.localDate)],
);
