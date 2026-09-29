import { and, desc, eq, sql } from 'drizzle-orm';
import {
  AppError,
  canonicalJson,
  contentTransitions,
  generatorConfigSchema,
  scenarioGraphSchema,
  sha256,
  uuidv7,
  type AdminActivityRequest,
} from '@learnarena/core';
import type { Database } from '../client';
import { activityVersions, contentAuditLog } from '../schema';
import { auditAdmin, loadRoles, requireRole } from './admin';
export async function listAdminActivities(db: Database, userId: string, at: Date) {
  requireRole(await loadRoles(db, userId), ['AUTHOR', 'REVIEWER', 'ADMIN']);
  await auditAdmin(db, userId, 'activities.list', null, null, null, at, 'activity_version');
  return {
    versions: await db
      .select()
      .from(activityVersions)
      .orderBy(desc(activityVersions.createdAt))
      .limit(200),
    audit: await db
      .select()
      .from(contentAuditLog)
      .where(eq(contentAuditLog.entityType, 'activity_version'))
      .orderBy(desc(contentAuditLog.createdAt))
      .limit(200),
  };
}
export async function mutateAdminActivity(
  db: Database,
  userId: string,
  input: AdminActivityRequest,
  at: Date,
) {
  const roles = await loadRoles(db, userId);
  requireRole(roles, ['AUTHOR', 'REVIEWER', 'ADMIN']);
  let version: typeof activityVersions.$inferSelect | undefined;
  if (input.action === 'save') {
    requireRole(roles, ['AUTHOR', 'ADMIN']);
    const draft = input.draft;
    const parsed =
      draft.kind === 'dialogue_scenario'
        ? scenarioGraphSchema.safeParse(draft.content)
        : generatorConfigSchema.safeParse(draft.content);
    if (!parsed.success)
      throw new AppError('INVALID_INPUT', {
        message: 'Invalid activity content or scenario graph.',
      });
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`activity:${draft.slug}`}))`);
    const versions = await db
      .select()
      .from(activityVersions)
      .where(eq(activityVersions.slug, draft.slug))
      .orderBy(desc(activityVersions.versionNumber));
    if (input.versionId) {
      version = versions.find((v) => v.id === input.versionId);
      if (!version) throw new AppError('NOT_FOUND');
      const reviewed = await db
        .select()
        .from(contentAuditLog)
        .where(
          and(eq(contentAuditLog.entityId, version.id), eq(contentAuditLog.toStatus, 'IN_REVIEW')),
        );
      if (version.status !== 'DRAFT' || reviewed.length)
        throw new AppError('INVALID_INPUT', {
          message: 'Create a new version to edit reviewed content.',
        });
      if (version.authorId !== userId && !roles.includes('ADMIN')) throw new AppError('FORBIDDEN');
    }
    const contentHash = sha256(
      canonicalJson({ kind: draft.kind, name: draft.name, content: parsed.data }),
    );
    if (!version) {
      const same = versions.find(
        (v) => v.status === 'DRAFT' && v.authorId === userId && v.contentHash === contentHash,
      );
      if (same) return { id: same.id };
    }
    const id = version?.id ?? uuidv7();
    const values = {
      slug: draft.slug,
      name: draft.name,
      kind: draft.kind,
      origin: draft.origin,
      source: draft.source,
      license: draft.license,
      contentJson: parsed.data,
      contentHash,
      updatedAt: at,
    };
    if (version) await db.update(activityVersions).set(values).where(eq(activityVersions.id, id));
    else
      await db
        .insert(activityVersions)
        .values({
          ...values,
          id,
          versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
          status: 'DRAFT',
          authorId: userId,
          createdAt: at,
        });
    await auditAdmin(
      db,
      userId,
      'activity.save',
      id,
      version ?? null,
      values,
      at,
      'activity_version',
    );
    return { id };
  }
  const [initial] = await db
    .select()
    .from(activityVersions)
    .where(eq(activityVersions.id, input.versionId));
  if (!initial) throw new AppError('NOT_FOUND');
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`activity:${initial.slug}`}))`);
  [version] = await db
    .select()
    .from(activityVersions)
    .where(eq(activityVersions.id, input.versionId))
    .for('update');
  if (!version) throw new AppError('NOT_FOUND');
  const to = input.to;
  requireRole(
    roles,
    to === 'APPROVED' || (to === 'DRAFT' && version.status === 'IN_REVIEW')
      ? ['REVIEWER']
      : to === 'LIVE' || to === 'ARCHIVED'
        ? ['ADMIN']
        : ['AUTHOR', 'ADMIN'],
  );
  if (to === 'APPROVED' && version.authorId === userId) throw new AppError('FORBIDDEN');
  if (to === 'IN_REVIEW' && version.authorId !== userId && !roles.includes('ADMIN'))
    throw new AppError('FORBIDDEN');
  if (version.status === to) return { id: version.id };
  if (!contentTransitions.canTransition(version.status, to)) throw new AppError('INVALID_INPUT');
  if (to === 'LIVE' && !version.reviewedBy) throw new AppError('FORBIDDEN');
  if (to === 'LIVE') {
    const previous = await db
      .select()
      .from(activityVersions)
      .where(and(eq(activityVersions.slug, version.slug), eq(activityVersions.status, 'LIVE')));
    for (const row of previous) {
      await db
        .update(activityVersions)
        .set({ status: 'ARCHIVED', updatedAt: at })
        .where(eq(activityVersions.id, row.id));
      await db
        .insert(contentAuditLog)
        .values({
          id: uuidv7(),
          actorId: userId,
          entityType: 'activity_version',
          entityId: row.id,
          fromStatus: 'LIVE',
          toStatus: 'ARCHIVED',
          createdAt: at,
        });
    }
  }
  await db
    .update(activityVersions)
    .set({
      status: to,
      updatedAt: at,
      ...(to === 'APPROVED' ? { reviewedBy: userId, reviewedAt: at } : {}),
      ...(to === 'LIVE' ? { publishedAt: at } : {}),
    })
    .where(and(eq(activityVersions.id, version.id), eq(activityVersions.status, version.status)));
  await db
    .insert(contentAuditLog)
    .values({
      id: uuidv7(),
      actorId: userId,
      entityType: 'activity_version',
      entityId: version.id,
      fromStatus: version.status,
      toStatus: to,
      createdAt: at,
    });
  await auditAdmin(
    db,
    userId,
    'activity.transition',
    version.id,
    { status: version.status },
    { status: to },
    at,
    'activity_version',
  );
  return { id: version.id };
}
