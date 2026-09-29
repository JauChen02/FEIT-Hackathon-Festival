import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { gameSessions } from './sessions';
export const lobbyStatusEnum = pgEnum('lobby_status', [
  'OPEN',
  'STARTING',
  'IN_MATCH',
  'CLOSED',
  'EXPIRED',
  'CANCELLED',
]);
export const lobbies = pgTable('lobbies', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  hostId: uuid('host_id')
    .notNull()
    .references(() => users.id),
  gameType: text('game_type').notNull(),
  status: lobbyStatusEnum('status').notNull(),
  sessionId: uuid('session_id').references(() => gameSessions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
export const lobbyMembers = pgTable(
  'lobby_members',
  {
    lobbyId: uuid('lobby_id')
      .notNull()
      .references(() => lobbies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.lobbyId, t.userId] })],
);
export const matchResults = pgTable('match_results', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => gameSessions.id),
  resultJson: jsonb('result_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
export const friendBonusGrants = pgTable(
  'friend_bonus_grants',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => gameSessions.id),
    userLowId: uuid('user_low_id')
      .notNull()
      .references(() => users.id),
    userHighId: uuid('user_high_id')
      .notNull()
      .references(() => users.id),
    utcDate: text('utc_date').notNull(),
    ordinal: integer('ordinal').notNull(),
  },
  (t) => [
    unique('friend_grant_session_pair').on(t.sessionId, t.userLowId, t.userHighId),
    unique('friend_grant_daily_slot').on(t.userLowId, t.userHighId, t.utcDate, t.ordinal),
  ],
);
