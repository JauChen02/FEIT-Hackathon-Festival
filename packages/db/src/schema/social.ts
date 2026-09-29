import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
export const friendshipStatusEnum = pgEnum('friendship_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'REMOVED',
]);
export const invitePurposeEnum = pgEnum('invite_purpose', ['FRIEND', 'LOBBY']);
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey(),
    userLowId: uuid('user_low_id')
      .notNull()
      .references(() => users.id),
    userHighId: uuid('user_high_id')
      .notNull()
      .references(() => users.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    status: friendshipStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    unique('friendship_pair_unique').on(t.userLowId, t.userHighId),
    check('friendship_normalized', sql`${t.userLowId} < ${t.userHighId}`),
  ],
);
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check('block_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);
export const inviteLinks = pgTable('invite_links', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  purpose: invitePurposeEnum('purpose').notNull(),
  redeemedBy: uuid('redeemed_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxUses: integer('max_uses').notNull(),
  uses: integer('uses').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
