/**
 * Loads `.env.local` so integration tests see the same DATABASE_URL and
 * Supabase settings as `pnpm dev`. Individual test files then point
 * DATABASE_URL at their own throwaway database (see helpers/testApp.ts).
 */
import '@learnarena/db/loadEnv';

// §21.3: integration tests run in the `test` environment, which is what lets
// db:reset and the dev seed run at all.
process.env.APP_ENV = 'test';

// The routes log every request (§23.1). That is useful in production and noise
// here. `.env.local` has already been applied by this point, so this overrides
// it outright; set TEST_LOG_LEVEL to see the lines while debugging a test.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
