import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import '@learnarena/db/loadEnv';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * E2E configuration (PLANNING.md §22.3).
 *
 * Runs against a real Next.js server and the real local Supabase Auth stack, so
 * the sign-up journey exercises the one piece the integration tests fake.
 */
export default defineConfig({
  testDir: path.join(here, 'e2e'),
  globalSetup: path.join(here, 'e2e/globalSetup.ts'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `next start` rather than `next dev`: the E2E suite should exercise the
    // same build CI produces, and dev-mode compilation makes the first
    // navigation flaky.
    command: 'pnpm build && pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      APP_ENV: process.env.APP_ENV ?? 'local',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
