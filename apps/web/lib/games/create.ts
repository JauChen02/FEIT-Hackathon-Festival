import 'server-only';
import { eq } from 'drizzle-orm';
import {
  AppError,
  isWeakCategory,
  localDateFor,
  scenarioGraphSchema,
  uuidv7,
  type CreateSessionRequest,
} from '@learnarena/core';
import {
  activitySessions,
  activityVersions,
  findCategoryBySlug,
  findOpenSoloSession,
  findSessionByIdempotencyKey,
  findRecommendationById,
  insertSession,
  lockStreakUser,
  markInProgress,
  type UserRecord,
} from '@learnarena/db';
import { db } from '../db';
import { loadCoachSignals } from '../coach/signals';
import { gameTypeIdForSlug } from '../sessions/gameTypes';
export async function createActivitySession(
  user: UserRecord,
  request: CreateSessionRequest,
  key: string,
  now: Date,
) {
  return db().transaction(async (tx) => {
    await lockStreakUser(tx, user.id);
    const prior = await findSessionByIdempotencyKey(tx, user.id, key);
    if (prior)
      return {
        sessionId: prior.id,
        status: prior.status,
        questionCount: prior.questionCount,
        timeLimitMs: prior.timeLimitMs,
      };
    const open = await findOpenSoloSession(tx, user.id);
    if (open)
      throw new AppError('ACTIVE_SESSION_EXISTS', {
        details: { sessionId: open.id, status: open.status },
      });
    const versions = await tx
      .select()
      .from(activityVersions)
      .where(eq(activityVersions.status, 'LIVE'));
    const version = versions.find(
      (v) =>
        v.kind === request.gameType &&
        (!request.activityVersionId || v.id === request.activityVersionId),
    );
    if (!version) throw new AppError('NOT_FOUND');
    const graph =
      version.kind === 'dialogue_scenario' ? scenarioGraphSchema.parse(version.contentJson) : null;
    const categorySlug =
      version.kind === 'memory_match'
        ? 'memory'
        : graph
          ? graph.nodes.find((n) => n.id === graph.start)!.categorySlug
          : 'math';
    const category = await findCategoryBySlug(tx, categorySlug);
    if (!category || category.status === 'DEFERRED') throw new AppError('NOT_FOUND');
    const mixed = graph && new Set(graph.nodes.map((n) => n.categorySlug)).size > 1;
    const signals = await loadCoachSignals(tx, user.id, now);
    const wasWeak = !mixed && isWeakCategory(signals.derived, categorySlug);
    const recommendation = request.recommendationId
      ? await findRecommendationById(tx, request.recommendationId)
      : undefined;
    const gameTypeId = await gameTypeIdForSlug(request.gameType);
    const eligible =
      recommendation &&
      recommendation.userId === user.id &&
      recommendation.localDate === localDateFor(user.timezone, now) &&
      recommendation.categoryId === category.id &&
      recommendation.gameTypeId === gameTypeId &&
      ['AVAILABLE', 'IN_PROGRESS'].includes(recommendation.status);
    const id = uuidv7();
    await insertSession(tx, {
      id,
      ownerId: user.id,
      gameTypeId,
      categoryId: mixed ? null : category.id,
      questionCount: 0,
      timeLimitMs: version.kind === 'speed_math' ? 60000 : 0,
      creationIdempotencyKey: key,
      weaknessTier: eligible ? 'RECOMMENDED' : wasWeak ? 'WEAK' : 'NONE',
      weaknessSnapshot: { wasWeak },
      recommendationId: eligible ? recommendation.id : null,
      questionVersionIds: [],
      now,
    });
    await tx
      .insert(activitySessions)
      .values({ sessionId: id, versionId: version.id, seed: id, nodeId: graph?.start ?? null });
    if (eligible) await markInProgress(tx, recommendation.id, now);
    return {
      sessionId: id,
      status: 'CREATED',
      questionCount: 0,
      timeLimitMs: version.kind === 'speed_math' ? 60000 : 0,
    };
  });
}
