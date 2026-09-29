-- Extensions required by the schema (PLANNING.md §14.2).
--
-- This migration must run before 0001, because `users.username` is `citext`.
-- Supabase places extensions in the `extensions` schema, which is already on
-- the default search_path; IF NOT EXISTS keeps this safe on a database where
-- the platform installed it for us.

CREATE EXTENSION IF NOT EXISTS citext;
