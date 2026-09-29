/**
 * Minimal `.env` loader for the CLI commands.
 *
 * Importing this module loads the environment as a side effect. ESM evaluates
 * imported modules in source order, so a CLI that lists `import './loadEnv'`
 * first is guaranteed to have its environment populated before any other module
 * body runs.
 *
 * Next.js loads `.env.local` itself, but the `db:*` and `content:import`
 * scripts run under plain tsx. Reading the same file here keeps one source of
 * configuration rather than asking developers to export variables by hand.
 *
 * Existing environment variables always win, so CI and `APP_ENV=... pnpm db:reset`
 * override the file rather than being silently overridden by it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Files are applied in order; the first definition of a key wins. */
const ENV_FILES = ['.env.local', '.env'];

function parse(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const file of ENV_FILES) {
    let contents: string;
    try {
      contents = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parse(contents))) {
      process.env[key] ??= value;
    }
  }
}

loadEnv();
