/**
 * Migration health (PLANNING.md §24 Phase 0, §14.4).
 *
 * Acceptance criteria covered:
 *   - "migration applies cleanly to an empty DB"
 *   - "and is reversible in local" — read as db:reset, since drizzle-kit emits
 *     no down-migrations (ADR-029)
 *   - "Migrations: checked into packages/db/migrations"
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { MVP_ENUM_NAMES, MVP_TABLE_NAMES, ALPHA_TABLE_NAMES } from '../src/schema/index';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/commands/migrate';
import { resetDatabase } from '../src/commands/reset';
import { createTestDatabase, type TestDatabase } from './helpers/database';

let ctx: TestDatabase;

beforeAll(async () => {
  // createTestDatabase creates an empty database and runs every migration,
  // which is itself the "applies cleanly to an empty DB" criterion.
  ctx = await createTestDatabase('migrate');
});

afterAll(async () => {
  await ctx?.drop();
});

async function tableNames(): Promise<string[]> {
  const rows = await ctx.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return rows.map((row) => row.tablename);
}

describe('checked-in migration files', () => {
  it('lives in packages/db/migrations and is tracked by a journal', () => {
    const files = readdirSync(MIGRATIONS_FOLDER)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(files).toEqual([
      '0000_extensions.sql',
      '0001_mvp_schema.sql',
      '0002_constraints_and_policies.sql',
      '0003_coach_indexes.sql',
      '0004_streak_freeze_fk.sql',
      '0005_daily_challenges.sql',
      '0006_solo_activities.sql',
      '0007_admin_publishing.sql',
      '0008_friends.sql',
      '0009_invite_redemption.sql',
      '0010_multiplayer.sql',
      '0011_engagement_privacy.sql',
      '0012_activity_review_metadata.sql',
    ]);

    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([
      '0000_extensions',
      '0001_mvp_schema',
      '0002_constraints_and_policies',
      '0003_coach_indexes',
      '0004_streak_freeze_fk',
      '0005_daily_challenges',
      '0006_solo_activities',
      '0007_admin_publishing',
      '0008_friends',
      '0009_invite_redemption',
      '0010_multiplayer',
      '0011_engagement_privacy',
      '0012_activity_review_metadata',
    ]);
  });

  it('creates the citext extension before the table that uses it', () => {
    const extensions = readFileSync(path.join(MIGRATIONS_FOLDER, '0000_extensions.sql'), 'utf8');
    expect(extensions).toMatch(/CREATE EXTENSION IF NOT EXISTS citext/i);
  });
});

describe('after applying every migration to an empty database', () => {
  it('creates all MVP and implemented Alpha tables', async () => {
    expect(await tableNames()).toEqual([...MVP_TABLE_NAMES, ...ALPHA_TABLE_NAMES].sort());
  });

  it('creates all 15 enum types with the documented values', async () => {
    const rows = await ctx.db.execute<{ typname: string; labels: string[] }>(
      sql`select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public'
          group by t.typname
          order by t.typname`,
    );
    expect(rows.map((row) => row.typname)).toEqual(
      [
        ...MVP_ENUM_NAMES,
        'solo_activity_kind',
        'friendship_status',
        'invite_purpose',
        'lobby_status',
      ].sort(),
    );

    const byName = new Map(rows.map((row) => [row.typname, row.labels]));
    expect(byName.get('session_status')).toEqual([
      'CREATED',
      'ACTIVE',
      'COMPLETED',
      'ABANDONED',
      'EXPIRED',
      'CANCELLED',
    ]);
    expect(byName.get('content_status')).toEqual([
      'DRAFT',
      'IN_REVIEW',
      'APPROVED',
      'LIVE',
      'ARCHIVED',
    ]);
    // ADR-037: ORDER and MATCH are Alpha, added later with ALTER TYPE.
    expect(byName.get('question_type')).toEqual(['MCQ', 'NUMERIC']);
  });

  it('creates the two partial unique indexes the invariants depend on', async () => {
    const rows = await ctx.db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where schemaname = 'public' and indexname in ('one_live_version', 'one_open_solo_session')
          order by indexname`,
    );
    expect(rows.map((row) => row.indexname)).toEqual(['one_live_version', 'one_open_solo_session']);
    expect(rows[0]!.indexdef).toMatch(/UNIQUE/);
    expect(rows[0]!.indexdef).toMatch(/WHERE .*LIVE/);
    expect(rows[1]!.indexdef).toMatch(/UNIQUE/);
    expect(rows[1]!.indexdef).toMatch(/CREATED/);
    expect(rows[1]!.indexdef).toMatch(/SOLO/);
  });

  it('creates the Phase 3 coach indexes (0003)', async () => {
    const rows = await ctx.db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where schemaname = 'public'
            and indexname in ('game_sessions_improvement_idx', 'recommendations_open_idx')
          order by indexname`,
    );
    expect(rows.map((row) => row.indexname)).toEqual([
      'game_sessions_improvement_idx',
      'recommendations_open_idx',
    ]);
    // §11.7 reads the most recent qualifying completions per category.
    expect(rows[0]!.indexdef).toMatch(/COMPLETED/);
    expect(rows[0]!.indexdef).toMatch(/is_qualifying/);
    // §11.5 reads the still-claimable recommendation for a local date.
    expect(rows[1]!.indexdef).toMatch(/AVAILABLE/);
    expect(rows[1]!.indexdef).toMatch(/IN_PROGRESS/);
  });

  it('creates the point_ledger append-only triggers', async () => {
    const rows = await ctx.db.execute<{ tgname: string }>(
      sql`select tgname from pg_trigger
          where tgrelid = 'point_ledger'::regclass and not tgisinternal
          order by tgname`,
    );
    expect(rows.map((row) => row.tgname)).toEqual([
      'point_ledger_no_delete',
      'point_ledger_no_update',
    ]);
  });

  it('stores username as citext', async () => {
    const rows = await ctx.db.execute<{ type: string }>(
      sql`select atttypid::regtype::text as type from pg_attribute
          where attrelid = 'users'::regclass and attname = 'username'`,
    );
    expect(rows[0]?.type).toBe('citext');
  });

  it('is a no-op when run a second time', async () => {
    const before = await tableNames();
    await runMigrations(ctx.db);
    expect(await tableNames()).toEqual(before);
  });
});

describe('db:reset (ADR-029: how a migration is reversed in local)', () => {
  it('drops everything and re-applies cleanly, repeatedly', async () => {
    for (let round = 0; round < 2; round += 1) {
      await resetDatabase(ctx.handle.sql);
      expect(await tableNames(), `after drop, round ${round}`).toEqual([]);

      await runMigrations(ctx.db);
      expect(await tableNames(), `after re-apply, round ${round}`).toEqual(
        [...MVP_TABLE_NAMES, ...ALPHA_TABLE_NAMES].sort(),
      );
    }
  });
});
