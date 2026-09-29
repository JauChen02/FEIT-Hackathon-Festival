import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import {
  canonicalJson,
  generatorConfigSchema,
  scenarioGraphSchema,
  sha256,
  soloModeSchema,
  uuidv7,
} from '@learnarena/core';
import type { Database } from '../client';
import { activityVersions, contentAuditLog } from '../schema';
import { findUserByUsername } from '../repositories/users';
import { readAppEnv } from '../env';
export async function importActivityFixtures(db: Database, now: Date) {
  const directory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../content/activities',
  );
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()) {
    const input = JSON.parse(await readFile(`${directory}/${file}`, 'utf8')) as {
      slug: string;
      name: string;
      kind: string;
      versionNumber: number;
      origin: 'DEV_SEED';
      authorUsername: string;
      reviewerUsername: string;
      content: unknown;
    };
    if (input.origin === 'DEV_SEED' && !['local', 'test'].includes(readAppEnv()))
      throw new Error('Development activities cannot be imported in production');
    const kind = soloModeSchema.parse(input.kind);
    const content =
      kind === 'dialogue_scenario'
        ? scenarioGraphSchema.parse(input.content)
        : generatorConfigSchema.parse(input.content);
    const hash = sha256(canonicalJson({ kind, name: input.name, content }));
    const author = await findUserByUsername(db, input.authorUsername);
    const reviewer = await findUserByUsername(db, input.reviewerUsername);
    if (!author || !reviewer || author.id === reviewer.id)
      throw new Error('A different author and reviewer are required');
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(activityVersions)
        .where(
          and(
            eq(activityVersions.slug, input.slug),
            eq(activityVersions.versionNumber, input.versionNumber),
          ),
        );
      if (existing) {
        if (existing.contentHash !== hash)
          throw new Error('Published activity changed; create a new version');
        return;
      }
      const id = uuidv7();
      await tx
        .insert(activityVersions)
        .values({
          id,
          slug: input.slug,
          name: input.name,
          versionNumber: input.versionNumber,
          kind,
          status: 'LIVE',
          origin: input.origin,
          contentJson: content,
          contentHash: hash,
          authorId: author.id,
          reviewedBy: reviewer.id,
          createdAt: now,
        });
      const states = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'LIVE'] as const;
      for (let i = 1; i < states.length; i++)
        await tx
          .insert(contentAuditLog)
          .values({
            id: uuidv7(),
            actorId: i === 1 ? author.id : reviewer.id,
            entityType: 'activity_version',
            entityId: id,
            fromStatus: states[i - 1]!,
            toStatus: states[i]!,
            note: 'Development fixture import; not production review.',
            createdAt: now,
          });
    });
  }
}
