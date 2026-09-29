import { date, pgTable, primaryKey, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { questionVersions } from './content';
export const dailyChallenges = pgTable('daily_challenges', {
  id: uuid('id').primaryKey(),
  challengeDate: date('challenge_date').notNull().unique(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const dailyChallengeQuestions = pgTable(
  'daily_challenge_questions',
  {
    dailyChallengeId: uuid('daily_challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.dailyChallengeId, table.position] })],
);
