/**
 * Environment guards on destructive commands (PLANNING.md §14.4, §24 Phase 0:
 * "db:reset refuses to run outside local/test").
 *
 * Pure unit tests: they call the guards with an explicit env object rather than
 * mutating process.env, so nothing here depends on how the suite was launched.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_ENVS,
  DestructiveCommandRefused,
  assertDevSeedAllowed,
  assertPushAllowed,
  assertResetAllowed,
  readAppEnv,
  requireDatabaseUrl,
  type AppEnv,
} from '../src/env';

const env = (appEnv?: string): NodeJS.ProcessEnv =>
  appEnv === undefined ? {} : { APP_ENV: appEnv };

describe('readAppEnv', () => {
  it.each(APP_ENVS)('recognises %s', (value) => {
    expect(readAppEnv(env(value))).toBe(value);
  });

  it('treats an unset APP_ENV as production, the safe default', () => {
    expect(readAppEnv(env())).toBe('production');
  });

  it.each(['staging', 'LOCAL', '', 'dev'])(
    'treats the unrecognised value %j as production',
    (value) => {
      expect(readAppEnv(env(value))).toBe('production');
    },
  );
});

describe('assertResetAllowed (db:reset)', () => {
  it.each<AppEnv>(['local', 'test'])('allows %s', (value) => {
    expect(assertResetAllowed(env(value))).toBe(value);
  });

  it.each(['production', 'preview'])('refuses %s', (value) => {
    expect(() => assertResetAllowed(env(value))).toThrow(DestructiveCommandRefused);
  });

  it('refuses when APP_ENV is unset', () => {
    expect(() => assertResetAllowed(env())).toThrow(DestructiveCommandRefused);
  });

  it('explains which command was refused and what would be allowed', () => {
    try {
      assertResetAllowed(env('production'));
      expect.unreachable('should have thrown');
    } catch (error) {
      const refusal = error as DestructiveCommandRefused;
      expect(refusal.command).toBe('db:reset');
      expect(refusal.appEnv).toBe('production');
      expect(refusal.message).toMatch(/local, test/);
      expect(refusal.message).toMatch(/§14.4/);
    }
  });
});

describe('assertPushAllowed (drizzle-kit push)', () => {
  it('allows local only — push bypasses the migration history', () => {
    expect(assertPushAllowed(env('local'))).toBe('local');
  });

  it.each(['test', 'preview', 'production'])('refuses %s', (value) => {
    expect(() => assertPushAllowed(env(value))).toThrow(DestructiveCommandRefused);
  });
});

describe('assertDevSeedAllowed', () => {
  it.each<AppEnv>(['local', 'test', 'preview'])('allows %s', (value) => {
    expect(assertDevSeedAllowed(env(value))).toBe(value);
  });

  it('refuses production — dev-seed content never reaches it (§13.6)', () => {
    expect(() => assertDevSeedAllowed(env('production'))).toThrow(DestructiveCommandRefused);
  });
});

describe('requireDatabaseUrl', () => {
  it('returns the url when set', () => {
    expect(requireDatabaseUrl({ DATABASE_URL: 'postgres://x' })).toBe('postgres://x');
  });

  it('fails with an actionable message when unset', () => {
    expect(() => requireDatabaseUrl({})).toThrow(/\.env\.example/);
  });
});
