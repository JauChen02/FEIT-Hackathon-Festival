import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': here,
      // Route handlers import `server-only` to fail loudly if they are ever
      // pulled into a client bundle. Under Vitest there is no bundler to make
      // that distinction, so it resolves to a no-op.
      'server-only': path.join(here, 'tests/stubs/serverOnly.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // One Postgres database is created per test file; running files
    // sequentially avoids contending for migration locks.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
