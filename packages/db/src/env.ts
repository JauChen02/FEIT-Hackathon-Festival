/**
 * Environment guards (PLANNING.md §14.4, §21.3).
 *
 * "drizzle-kit push is allowed only against a local database (APP_ENV=local);
 *  the command wrapper refuses otherwise."
 * "pnpm db:reset works only when APP_ENV=local or APP_ENV=test."
 */

export const APP_ENVS = ['local', 'test', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export class DestructiveCommandRefused extends Error {
  readonly appEnv: string;
  readonly command: string;

  constructor(command: string, appEnv: string, allowed: readonly AppEnv[]) {
    super(
      `Refusing to run "${command}": APP_ENV is "${appEnv}", but this command is only ` +
        `allowed when APP_ENV is one of ${allowed.join(', ')} (PLANNING.md §14.4).`,
    );
    this.name = 'DestructiveCommandRefused';
    this.appEnv = appEnv;
    this.command = command;
  }
}

/**
 * Read APP_ENV. An unset or unrecognised value is treated as `production` —
 * the safe default, so a missing env var refuses destructive work rather than
 * permitting it.
 */
export function readAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const value = env.APP_ENV;
  return (APP_ENVS as readonly string[]).includes(value ?? '') ? (value as AppEnv) : 'production';
}

export function assertAppEnvIn(
  command: string,
  allowed: readonly AppEnv[],
  env: NodeJS.ProcessEnv = process.env,
): AppEnv {
  const appEnv = readAppEnv(env);
  if (!allowed.includes(appEnv)) {
    throw new DestructiveCommandRefused(command, env.APP_ENV ?? '(unset)', allowed);
  }
  return appEnv;
}

/** `db:reset` drops every table; allowed in local and test only. */
export function assertResetAllowed(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return assertAppEnvIn('db:reset', ['local', 'test'], env);
}

/** `drizzle-kit push` bypasses migrations entirely; local only. */
export function assertPushAllowed(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return assertAppEnvIn('drizzle-kit push', ['local'], env);
}

/** Dev-seed content must never reach production (§13.6). */
export function assertDevSeedAllowed(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return assertAppEnvIn('db:seed (DEV_SEED content)', ['local', 'test', 'preview'], env);
}

export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  }
  return url;
}
