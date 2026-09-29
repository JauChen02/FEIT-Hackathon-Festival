import { customType } from 'drizzle-orm/pg-core';

/**
 * `citext` — case-insensitive text (PLANNING.md §14.2, `users.username`).
 *
 * The extension is created in migration 0000, which must therefore run before
 * any table using this type.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});
