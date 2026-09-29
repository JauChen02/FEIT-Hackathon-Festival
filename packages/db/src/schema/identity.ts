/**
 * Identity tables (PLANNING.md §14.2, "Identity" block).
 *
 * `users.id` is the Supabase auth user id. A row exists only once onboarding
 * completes (ADR-022): every NOT NULL column here is collected on that screen,
 * so "no row" is precisely the onboarding-incomplete state.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from '../types/citext';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    /** = Supabase auth user id (§14.2). Not generated here. */
    id: uuid('id').primaryKey(),
    /** 3..20 chars of [a-z0-9_], case-insensitive unique. */
    username: citext('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    /** IANA identifier, validated at the API boundary (§12.1). */
    timezone: text('timezone').notNull(),
    ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /** Rebuildable projection of SUM(point_ledger.final_points) (§14.3, ADR-006). */
    totalPointsCached: bigint('total_points_cached', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete until the V1 deletion flow (§14.1, §19.4). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check('users_username_length', sql`length(${table.username}) between 3 and 20`),
    // The cast to text is load-bearing: `citext` overloads the regex operators
    // to be case-insensitive, so `username ~ '^[a-z0-9_]+$'` would happily
    // accept "Alex". Comparing the stored text keeps the column lowercase, as
    // §14.2 specifies, while the UNIQUE index stays case-insensitive.
    check('users_username_charset', sql`(${table.username})::text ~ '^[a-z0-9_]+$'`),
    check('users_timezone_not_blank', sql`length(btrim(${table.timezone})) > 0`),
  ],
);

/** §13.1: AUTHOR / REVIEWER / ADMIN. A reviewer must not approve their own version. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

/**
 * §12.1: timezone changes are limited to one per 24 hours and logged.
 * The cooldown itself is enforced in Phase 2 (ADR-024); the audit table exists
 * from Phase 0 because it is tagged [MVP] in §14.2.
 */
export const userTimezoneChanges = pgTable(
  'user_timezone_changes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    oldTz: text('old_tz').notNull(),
    newTz: text('new_tz').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('user_timezone_changes_user_idx').on(table.userId, table.changedAt)],
);
