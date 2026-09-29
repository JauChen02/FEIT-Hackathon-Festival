/**
 * The point ledger (PLANNING.md §14.2, "Points" block; ADR-006).
 *
 * Invariant 3: "Every point change has a canonical point_ledger record. The
 * ledger is append-only; corrections are new ADJUSTMENT rows, never updates or
 * deletes." The append-only rule is enforced by BEFORE UPDATE/DELETE triggers
 * added in migration 0002 — see that file for why a trigger rather than GRANTs.
 *
 * Invariant 4: user-facing totals are reproducible from this table;
 * `users.total_points_cached` and the Redis leaderboards are projections.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { ledgerReasonEnum } from './enums';
import { users } from './identity';
import { gameSessions } from './sessions';

export const pointLedger = pgTable(
  'point_ledger',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').references(() => gameSessions.id, { onDelete: 'restrict' }),
    reason: ledgerReasonEnum('reason').notNull(),

    // The full §10 breakdown, so any award can be reproduced.
    rawBasePoints: numeric('raw_base_points', { precision: 12, scale: 4 }).notNull(),
    comboAdjustedPoints: numeric('combo_adjusted_points', { precision: 12, scale: 4 }).notNull(),
    /** Every multiplier, its components and its inputs (§10.4). */
    multipliersJson: jsonb('multipliers_json').notNull(),
    uncappedPoints: numeric('uncapped_points', { precision: 12, scale: 4 }).notNull(),
    capApplied: boolean('cap_applied').notNull(),
    /** Rounded exactly once, here (§10.2 step 8). */
    finalPoints: integer('final_points').notNull(),

    /** 'YYYY-Www' from created_at in UTC (§12.2, ADR-014). */
    weekKey: text('week_key').notNull(),
    /** e.g. 'session:{sid}:user:{uid}:SESSION_COMPLETION' (§18.1). */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    /** Set on ADJUSTMENT rows to point at the row being corrected. */
    adjustsLedgerId: uuid('adjusts_ledger_id').references((): AnyPgColumn => pointLedger.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('point_ledger_week_user_idx').on(table.weekKey, table.userId),
    index('point_ledger_user_idx').on(table.userId, table.createdAt),
    check('point_ledger_week_key_format', sql`${table.weekKey} ~ '^\\d{4}-W\\d{2}$'`),
    check(
      'point_ledger_adjustment_target',
      sql`(${table.reason} = 'ADJUSTMENT') = (${table.adjustsLedgerId} is not null)`,
    ),
  ],
);
