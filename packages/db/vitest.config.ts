import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one Postgres instance; each file gets its own
    // schema (see tests/helpers/database.ts), but migrations are heavy enough
    // that running files sequentially is faster than contending for locks.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
