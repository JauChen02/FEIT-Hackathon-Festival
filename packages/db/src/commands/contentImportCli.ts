/**
 * CLI entry point for `pnpm content:import` (PLANNING.md §13.4).
 *
 * Usage:
 *   pnpm content:import [--dir <path>] [--dry-run]
 */

// Must be first: populates process.env from .env.local before anything reads it.
import '../loadEnv';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../client';
import { readAppEnv } from '../env';
import { ContentImportError, importContent } from './contentImport';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const DEFAULT_CONTENT_DIR = path.join(REPO_ROOT, 'content');

function parseArgs(argv: readonly string[]): { dir: string; dryRun: boolean } {
  const dirIndex = argv.indexOf('--dir');
  const dir = dirIndex >= 0 ? path.resolve(argv[dirIndex + 1] ?? '') : DEFAULT_CONTENT_DIR;
  return { dir, dryRun: argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dir, dryRun } = parseArgs(process.argv.slice(2));
  const appEnv = readAppEnv();

  const handle = createDatabase({ max: 1 });
  try {
    const summary = await importContent(handle.db, {
      dir,
      dryRun,
      // §13.6: dev-seed content is "never imported into production".
      forbiddenOrigins: appEnv === 'production' ? ['DEV_SEED'] : [],
    });

    for (const result of summary.results) {
      if (result.outcome === 'created') {
        const archived =
          result.archivedVersionNumber !== undefined
            ? ` (archived v${result.archivedVersionNumber})`
            : '';
        console.log(`  + ${result.externalId} v${result.versionNumber}${archived}`);
      }
    }

    console.log(
      `${dryRun ? '[dry run] ' : ''}content:import — ` +
        `${summary.created} created, ${summary.unchanged} unchanged, ` +
        `${summary.archived} archived (from ${dir})`,
    );
  } catch (error) {
    if (error instanceof ContentImportError) {
      console.error(`\ncontent:import failed — nothing was written.\n\n  ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
