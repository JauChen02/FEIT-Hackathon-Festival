/**
 * Taxonomy tables (PLANNING.md §14.2, "Taxonomy" block).
 *
 * All six long-term categories from §2.1 exist as rows; only the three launch
 * categories carry status LAUNCH (ADR-002, ADR-036).
 */

import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { categoryStatusEnum, gameModeEnum, gameTypeStatusEnum } from './enums';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  icon: text('icon'),
  status: categoryStatusEnum('status').notNull(),
});

export const gameTypes = pgTable('game_types', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  mode: gameModeEnum('mode').notNull(),
  status: gameTypeStatusEnum('status').notNull(),
});

/** Which categories a game type can be played in. Read by the Coach (§11.5 step 3). */
export const gameTypeCategories = pgTable(
  'game_type_categories',
  {
    gameTypeId: uuid('game_type_id')
      .notNull()
      .references(() => gameTypes.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.gameTypeId, table.categoryId] })],
);
