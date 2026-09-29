import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { gameSessions } from './sessions';
export const coachMessages = pgTable(
  'coach_messages',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    refKey: text('ref_key').notNull(),
    sessionId: uuid('session_id').references(() => gameSessions.id),
    weekKey: text('week_key'),
    message: text('message').notNull(),
    source: text('source').notNull(),
    inputSnapshotJson: jsonb('input_snapshot_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('coach_message_once').on(t.userId, t.kind, t.refKey)],
);
export const achievements = pgTable('achievements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});
export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    achievementId: text('achievement_id')
      .notNull()
      .references(() => achievements.id),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);
export const eventMultipliers = pgTable(
  'event_multipliers',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    multiplier: numeric('multiplier', { precision: 3, scale: 2 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('event_multiplier_range', sql`${t.multiplier} between 1 and 2`),
    check('event_window_valid', sql`${t.startsAt} < ${t.endsAt}`),
  ],
);
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  quietStart: integer('quiet_start').notNull().default(21),
  quietEnd: integer('quiet_end').notNull().default(8),
  dailyGoal: integer('daily_goal').notNull().default(1),
  breakReminder: boolean('break_reminder').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  keysJson: jsonb('keys_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
export const notificationSendLog = pgTable(
  'notification_send_log',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    localDate: date('local_date').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('activity_event_once').on(t.actorId, t.kind, t.refId)],
);
export const deletionRequests = pgTable('deletion_requests', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  authDeletedAt: timestamp('auth_deleted_at', { withTimezone: true }),
});
