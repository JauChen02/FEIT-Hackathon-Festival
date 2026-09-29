/**
 * Streak tables (PLANNING.md §14.2, "Streaks" block; §12.1 for the rules).
 *
 * ADR-013: streaks are derived from stored local dates. There is no midnight
 * cron; rows are written at qualifying completion using the user's timezone at
 * that moment, and display state is computed at read time.
 *
 * The logic lands in Phase 2; these tables are tagged [MVP] so they ship now.
 */

import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { freezeStatusEnum, streakDaySourceEnum } from './enums';
import { users } from './identity';
import { gameSessions } from './sessions';

/** One row per credited local date. Historical rows are immutable (§12.1). */
export const streakDays = pgTable(
  'streak_days',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    source: streakDaySourceEnum('source').notNull(),
    sessionId: uuid('session_id').references(() => gameSessions.id, { onDelete: 'set null' }),
    freezeId: uuid('freeze_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // PK doubles as the idempotency guard: two qualifying sessions on one local
    // date create one row (§18.1).
    primaryKey({ columns: [table.userId, table.localDate] }),
  ],
);

export const streakFreezes = pgTable(
  'streak_freezes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: freezeStatusEnum('status').notNull(),
    /** UNIQUE per user: prevents duplicate grants at the same milestone (§12.1). */
    earnedOnLocalDate: date('earned_on_local_date').notNull(),
    consumedForLocalDate: date('consumed_for_local_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    unique('streak_freezes_user_earned_unique').on(table.userId, table.earnedOnLocalDate),
    unique('streak_freezes_user_consumed_unique').on(table.userId, table.consumedForLocalDate),
    // Freezes are consumed oldest-first (§12.1 step 5), so the lookup is
    // "available freezes for this user, by earned date".
    index('streak_freezes_available_idx')
      .on(table.userId, table.earnedOnLocalDate)
      .where(sql`${table.status} = 'AVAILABLE'`),
  ],
);

/** Rebuildable cache (§14.3). Canonical source: streak_days + streak_freezes. */
export const streakSummary = pgTable('streak_summary', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentLen: integer('current_len').notNull().default(0),
  longestLen: integer('longest_len').notNull().default(0),
  lastLocalDate: date('last_local_date'),
  freezesAvailable: smallint('freezes_available').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
