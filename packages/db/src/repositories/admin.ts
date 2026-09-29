import { and, desc, eq, sql } from 'drizzle-orm';
import {
  AppError,
  canonicalJson,
  contentTransitions,
  sha256,
  uuidv7,
  type AdminContentRequest,
} from '@learnarena/core';
import type { Database } from '../client';
import {
  categories,
  adminAuditLog,
  contentAuditLog,
  questionVersions,
  questions,
  userRoles,
} from '../schema';
import { findCategoryBySlug } from './categories';
import { publishDailyChallenge } from './challenges';
export type AdminRole = 'AUTHOR' | 'REVIEWER' | 'ADMIN';
export async function loadRoles(db: Database, userId: string): Promise<AdminRole[]> {
  return (await db.select().from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
}
export function requireRole(roles: readonly AdminRole[], allowed: readonly AdminRole[]) {
  if (!roles.some((r) => allowed.includes(r))) throw new AppError('FORBIDDEN');
}
export async function auditAdmin(
  db: Database,
  actorId: string,
  action: string,
  targetId: string | null,
  beforeJson: unknown,
  afterJson: unknown,
  now: Date,
  targetType = 'question_version',
) {
  await db
    .insert(adminAuditLog)
    .values({
      id: uuidv7(),
      actorId,
      action,
      targetType,
      targetId,
      beforeJson,
      afterJson,
      createdAt: now,
    });
}
export async function listAdminContent(db: Database, actorId: string, now: Date) {
  const roles = await loadRoles(db, actorId);
  requireRole(roles, ['AUTHOR', 'REVIEWER', 'ADMIN']);
  const rows = await db
    .select({
      version: questionVersions,
      externalId: questions.externalId,
      categorySlug: categories.slug,
    })
    .from(questionVersions)
    .innerJoin(questions, eq(questions.id, questionVersions.questionId))
    .innerJoin(categories, eq(categories.id, questionVersions.categoryId))
    .orderBy(desc(questionVersions.createdAt))
    .limit(200);
  const versions = rows.map((row) => ({
    ...row.version,
    externalId: row.externalId,
    categorySlug: row.categorySlug,
  }));
  const audit = await db
    .select()
    .from(contentAuditLog)
    .orderBy(desc(contentAuditLog.createdAt))
    .limit(200);
  await auditAdmin(db, actorId, 'content.list', null, null, null, now);
  return { roles, versions, audit };
}
export async function mutateAdminContent(
  db: Database,
  actorId: string,
  input: AdminContentRequest,
  now: Date,
) {
  const roles = await loadRoles(db, actorId);
  requireRole(roles, ['AUTHOR', 'REVIEWER', 'ADMIN']);
  if (input.action === 'daily') {
    requireRole(roles, ['ADMIN']);
    const id = await publishDailyChallenge(db, input.date, input.questionVersionIds, actorId, now);
    await auditAdmin(db, actorId, 'daily.publish', id, null, { date: input.date }, now);
    return { id };
  }
  if (input.action === 'save') {
    requireRole(roles, ['AUTHOR', 'ADMIN']);
    const draft = input.draft;
    const category = await findCategoryBySlug(db, draft.categorySlug);
    if (!category) throw new AppError('INVALID_INPUT');
    const hash = sha256(canonicalJson(draft));
    let existing: typeof questionVersions.$inferSelect | undefined;
    if (input.versionId) {
      [existing] = await db
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, input.versionId))
        .for('update');
      if (!existing) throw new AppError('NOT_FOUND');
      if (existing.authorId !== actorId && !roles.includes('ADMIN'))
        throw new AppError('FORBIDDEN');
      const reviewed =
        (
          await db
            .select()
            .from(contentAuditLog)
            .where(
              and(
                eq(contentAuditLog.entityId, existing.id),
                eq(contentAuditLog.toStatus, 'IN_REVIEW'),
              ),
            )
            .limit(1)
        ).length > 0;
      if (existing.status !== 'DRAFT' || reviewed)
        throw new AppError('INVALID_INPUT', {
          message: 'Create a new version to change previously reviewed content.',
        });
      if (existing.contentHash === hash) return { id: existing.id };
    }
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`question:${draft.externalId}`}))`,
    );
    let [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.externalId, draft.externalId));
    if (!question) {
      [question] = await db
        .insert(questions)
        .values({ id: uuidv7(), externalId: draft.externalId, authorId: actorId, createdAt: now })
        .returning();
    }
    if (existing && existing.questionId !== question!.id) throw new AppError('INVALID_INPUT');
    const versions = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.questionId, question!.id))
      .orderBy(desc(questionVersions.versionNumber));
    if (!existing) {
      const duplicate = versions.find(
        (v) => v.status === 'DRAFT' && v.authorId === actorId && v.contentHash === hash,
      );
      if (duplicate) return { id: duplicate.id };
    }
    const values = {
      type: draft.type,
      categoryId: category.id,
      prompt: draft.prompt,
      optionsJson: draft.options ?? null,
      answerJson: draft.answer,
      explanation: draft.explanation,
      difficulty: draft.difficulty,
      rating: String(700 + 100 * draft.difficulty),
      origin: draft.origin,
      source: draft.source,
      license: draft.license,
      contentHash: hash,
      updatedAt: now,
    };
    const id = existing?.id ?? uuidv7();
    if (existing) await db.update(questionVersions).set(values).where(eq(questionVersions.id, id));
    else
      await db
        .insert(questionVersions)
        .values({
          ...values,
          id,
          questionId: question!.id,
          versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
          status: 'DRAFT',
          authorId: actorId,
          createdAt: now,
        });
    await auditAdmin(db, actorId, 'content.save', id, existing ?? null, values, now);
    return { id };
  }
  const [initial] = await db
    .select()
    .from(questionVersions)
    .where(eq(questionVersions.id, input.versionId));
  if (!initial) throw new AppError('NOT_FOUND');
  await db.select().from(questions).where(eq(questions.id, initial.questionId)).for('update');
  const [version] = await db
    .select()
    .from(questionVersions)
    .where(eq(questionVersions.id, input.versionId))
    .for('update');
  if (!version) throw new AppError('NOT_FOUND');
  if (input.action === 'fork') {
    requireRole(roles, ['AUTHOR', 'ADMIN']);
    const versions = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.questionId, version.questionId))
      .orderBy(desc(questionVersions.versionNumber));
    const latest = versions[0]!;
    if (latest.status === 'DRAFT' && latest.authorId === actorId && latest.id !== version.id)
      return { id: latest.id };
    const id = uuidv7();
    await db
      .insert(questionVersions)
      .values({
        ...version,
        id,
        versionNumber: latest.versionNumber + 1,
        status: 'DRAFT',
        authorId: actorId,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    await auditAdmin(
      db,
      actorId,
      'content.fork',
      id,
      version,
      { sourceVersionId: version.id },
      now,
    );
    return { id };
  }
  const { to } = input;
  requireRole(
    roles,
    to === 'APPROVED' || (to === 'DRAFT' && version.status === 'IN_REVIEW')
      ? ['REVIEWER']
      : to === 'LIVE' || to === 'ARCHIVED'
        ? ['ADMIN']
        : ['AUTHOR', 'ADMIN'],
  );
  if (to === 'APPROVED' && version.authorId === actorId)
    throw new AppError('FORBIDDEN', { message: 'A different reviewer must approve this version.' });
  if (to === 'IN_REVIEW' && version.authorId !== actorId && !roles.includes('ADMIN'))
    throw new AppError('FORBIDDEN');
  if (version.status === to) return { id: version.id };
  if (!contentTransitions.canTransition(version.status, to))
    throw new AppError('INVALID_INPUT', { message: 'That content transition is not allowed.' });
  if (to === 'LIVE' && !version.reviewedBy) throw new AppError('FORBIDDEN');
  if (to === 'LIVE') {
    const live = await db
      .select()
      .from(questionVersions)
      .where(
        and(
          eq(questionVersions.questionId, version.questionId),
          eq(questionVersions.status, 'LIVE'),
        ),
      );
    for (const old of live) {
      await db
        .update(questionVersions)
        .set({ status: 'ARCHIVED', archivedAt: now, updatedAt: now })
        .where(eq(questionVersions.id, old.id));
      await db
        .insert(contentAuditLog)
        .values({
          id: uuidv7(),
          actorId,
          entityType: 'question_version',
          entityId: old.id,
          fromStatus: 'LIVE',
          toStatus: 'ARCHIVED',
          note: 'Replaced by a new version',
          createdAt: now,
        });
    }
  }
  await db
    .update(questionVersions)
    .set({
      status: to,
      updatedAt: now,
      ...(to === 'APPROVED' ? { reviewedBy: actorId, reviewedAt: now } : {}),
      ...(to === 'LIVE' ? { publishedAt: now } : {}),
      ...(to === 'ARCHIVED' ? { archivedAt: now } : {}),
    })
    .where(and(eq(questionVersions.id, version.id), eq(questionVersions.status, version.status)));
  await db
    .insert(contentAuditLog)
    .values({
      id: uuidv7(),
      actorId,
      entityType: 'question_version',
      entityId: version.id,
      fromStatus: version.status,
      toStatus: to,
      note: input.note ?? null,
      createdAt: now,
    });
  await auditAdmin(
    db,
    actorId,
    'content.transition',
    version.id,
    { status: version.status },
    { status: to },
    now,
  );
  return { id: version.id };
}
