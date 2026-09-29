import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  AppError,
  canonicalJson,
  generateMath,
  generateMemory,
  generatorConfigSchema,
  memoryCorrectness,
  scenarioGraphSchema,
  uuidv7,
  type ModeAnswerResult,
  type ModeQuestion,
} from '@learnarena/core';
import type { Database } from '../client';
import {
  activityAssessments,
  activitySessions,
  activityVersions,
  categories,
  gameSessions,
} from '../schema';
import { lockSession, requireTransition, touchSession } from './sessions';
import { recordLearningEvent } from '../learning/recordEvent';
export async function listActivities(db: Database) {
  return db
    .select({
      id: activityVersions.id,
      name: activityVersions.name,
      slug: activityVersions.slug,
      kind: activityVersions.kind,
    })
    .from(activityVersions)
    .where(eq(activityVersions.status, 'LIVE'))
    .orderBy(asc(activityVersions.slug));
}
export async function activityForSession(db: Database, sessionId: string) {
  return (
    await db
      .select({ activity: activitySessions, version: activityVersions })
      .from(activitySessions)
      .innerJoin(activityVersions, eq(activityVersions.id, activitySessions.versionId))
      .where(eq(activitySessions.sessionId, sessionId))
  )[0];
}
export async function listActivityAssessments(db: Database, sessionId: string) {
  return db
    .select()
    .from(activityAssessments)
    .where(eq(activityAssessments.sessionId, sessionId))
    .orderBy(asc(activityAssessments.position));
}
async function requireActive(db: Database, sessionId: string, userId: string) {
  const session = await lockSession(db, sessionId);
  if (!session || session.ownerId !== userId) throw new AppError('SESSION_NOT_FOUND');
  if (session.status === 'COMPLETED') throw new AppError('SESSION_ALREADY_COMPLETED');
  if (session.status !== 'CREATED' && session.status !== 'ACTIVE')
    throw new AppError('INVALID_SESSION_STATE');
  return session;
}
export async function serveActivity(
  db: Database,
  sessionId: string,
  userId: string,
  now: Date,
): Promise<ModeQuestion> {
  const session = await requireActive(db, sessionId, userId);
  const data = await activityForSession(db, sessionId);
  if (!data) throw new AppError('NOT_FOUND');
  let { activity } = data;
  const { version } = data;
  if (session.status === 'CREATED') {
    await requireTransition(db, sessionId, 'CREATED', 'ACTIVE', {
      startedAt: now,
      lastActivityAt: now,
    });
    const deadlineAt = version.kind === 'speed_math' ? new Date(now.getTime() + 60000) : null;
    await db
      .update(activitySessions)
      .set({ deadlineAt })
      .where(eq(activitySessions.sessionId, sessionId));
    activity = { ...activity, deadlineAt };
  }
  if (activity.finished)
    throw new AppError('INVALID_SESSION_STATE', { details: { sessionFinished: true } });
  const assessments = await listActivityAssessments(db, sessionId);
  let item = assessments.find((a) => a.outcome === null);
  if (activity.deadlineAt && now >= activity.deadlineAt) {
    if (item) await resolveActivity(db, sessionId, userId, item.id, {}, now, true);
    await db
      .update(activitySessions)
      .set({ finished: true })
      .where(eq(activitySessions.sessionId, sessionId));
    return {
      id: item?.id ?? sessionId,
      position: assessments.length,
      kind: version.kind,
      prompt: 'Sprint complete',
      options: null,
      sequence: null,
      revealUntil: null,
      deadlineAt: activity.deadlineAt.toISOString(),
      finished: true,
    };
  }
  if (!item) {
    const position = assessments.length;
    let prompt: string;
    let explanation: string;
    let answerJson: unknown;
    let optionsJson: unknown = null;
    let sourceKey = String(position);
    let categoryId = session.categoryId;
    let rating = 1000;
    let revealUntil: Date | null = null;
    if (version.kind === 'dialogue_scenario') {
      const graph = scenarioGraphSchema.parse(version.contentJson);
      const node = graph.nodes.find((n) => n.id === (activity.nodeId ?? graph.start))!;
      if (node.ending)
        throw new AppError('INVALID_SESSION_STATE', { details: { sessionFinished: true } });
      sourceKey = node.id;
      prompt = node.line;
      explanation = 'Review your choice and its consequences.';
      answerJson = node.choices;
      optionsJson = node.choices!.map((c) => ({ id: c.id, text: c.text }));
      categoryId =
        (await db.select().from(categories).where(eq(categories.slug, node.categorySlug)))[0]?.id ??
        null;
    } else {
      const config = generatorConfigSchema.parse(version.contentJson);
      const generated =
        version.kind === 'speed_math'
          ? generateMath(activity.seed, position, config.difficulty)
          : generateMemory(activity.seed, position, config.difficulty);
      prompt = generated.prompt;
      explanation = generated.explanation;
      rating = generated.rating;
      answerJson = { value: generated.answer, sequence: generated.sequence };
      if (version.kind === 'memory_match')
        revealUntil = new Date(
          now.getTime() + Math.max(3000, (generated.sequence?.length ?? 0) * 700),
        );
    }
    if (!categoryId) throw new AppError('INVALID_INPUT');
    [item] = await db
      .insert(activityAssessments)
      .values({
        id: uuidv7(),
        sessionId,
        userId,
        position,
        sourceKey,
        categoryId,
        prompt,
        explanation,
        answerJson,
        optionsJson,
        rating: String(rating),
        servedAt: now,
        revealUntil,
        deadlineAt: activity.deadlineAt,
      })
      .returning();
  }
  await touchSession(db, sessionId, now);
  const key = item!.answerJson as { sequence?: number[] };
  return {
    id: item!.id,
    position: item!.position,
    kind: version.kind,
    prompt: item!.prompt,
    options: item!.optionsJson as { id: string; text: string }[] | null,
    sequence:
      version.kind === 'memory_match' && item!.revealUntil && now < item!.revealUntil
        ? (key.sequence ?? null)
        : null,
    revealUntil: item!.revealUntil?.toISOString() ?? null,
    deadlineAt: activity.deadlineAt?.toISOString() ?? null,
    finished: false,
  };
}
export async function resolveActivity(
  db: Database,
  sessionId: string,
  userId: string,
  itemId: string,
  response: { value?: string; optionId?: string },
  now: Date,
  timeout = false,
): Promise<ModeAnswerResult> {
  const session = await requireActive(db, sessionId, userId);
  const data = await activityForSession(db, sessionId);
  if (!data) throw new AppError('NOT_FOUND');
  const { activity, version } = data;
  const [item] = await db
    .select()
    .from(activityAssessments)
    .where(
      and(
        eq(activityAssessments.id, itemId),
        eq(activityAssessments.sessionId, sessionId),
        eq(activityAssessments.userId, userId),
      ),
    );
  if (!item) throw new AppError('QUESTION_NOT_CURRENT');
  if (item.outcome) {
    if (canonicalJson(item.responseJson) !== canonicalJson(response))
      throw new AppError('ANSWER_ALREADY_SUBMITTED');
    return item.resultJson as ModeAnswerResult;
  }
  if (item.revealUntil && now < item.revealUntil)
    throw new AppError('INVALID_INPUT', {
      message: 'Wait for the sequence to disappear before answering.',
    });
  const expired = timeout || Boolean(activity.deadlineAt && now > activity.deadlineAt);
  let correctness = 0;
  let explanation = item.explanation;
  let correctAnswer = '';
  let finished = expired;
  let bestEnding = false;
  let nodeId = activity.nodeId;
  if (version.kind === 'dialogue_scenario') {
    const graph = scenarioGraphSchema.parse(version.contentJson);
    const node = graph.nodes.find((n) => n.id === item.sourceKey)!;
    const choice = node.choices!.find((c) => c.id === response.optionId);
    if (!choice) throw new AppError('INVALID_INPUT');
    correctness = choice.correctness;
    explanation = choice.feedback;
    correctAnswer = node.choices!.reduce((best, c) =>
      c.correctness > best.correctness ? c : best,
    ).text;
    nodeId = choice.nextNodeId;
    const next = graph.nodes.find((n) => n.id === nodeId)!;
    finished = next.ending === true;
    bestEnding = next.bestEnding === true;
  } else {
    const key = item.answerJson as { value: string; sequence?: number[] };
    correctAnswer = key.value;
    if (!expired && typeof response.value !== 'string') throw new AppError('INVALID_INPUT');
    correctness = expired
      ? 0
      : version.kind === 'memory_match'
        ? memoryCorrectness(key.sequence!, response.value!)
        : Number(response.value!.trim()) === Number(key.value)
          ? 1
          : 0;
    if (version.kind === 'memory_match')
      finished = item.position + 1 >= generatorConfigSchema.parse(version.contentJson).rounds;
  }
  const result = { correctness, explanation, correctAnswer, sessionFinished: finished };
  const speed =
    version.kind === 'speed_math'
      ? 0.5 + 0.5 * Math.max(0, (activity.deadlineAt!.getTime() - now.getTime()) / 60000)
      : 1;
  await db
    .update(activityAssessments)
    .set({
      outcome: expired ? 'TIMEOUT' : 'ANSWERED',
      responseJson: response,
      correctness: correctness.toFixed(3),
      speedFactor: speed.toFixed(4),
      resolvedAt: now,
      resultJson: result,
    })
    .where(and(eq(activityAssessments.id, item.id), isNull(activityAssessments.outcome)));
  await recordLearningEvent(db, {
    id: uuidv7(),
    userId,
    sessionId,
    gameTypeId: session.gameTypeId,
    sourceKey: item.sourceKey,
    categoryId: item.categoryId,
    subTopic:
      version.kind === 'dialogue_scenario'
        ? 'decision-making'
        : version.kind === 'speed_math'
          ? 'arithmetic'
          : 'sequence-recall',
    difficultyRating: item.rating,
    correctness: correctness.toFixed(3),
    timedOut: expired,
    responseTimeMs: now.getTime() - item.servedAt.getTime(),
    occurredAt: now,
  });
  await db
    .update(activitySessions)
    .set({ finished, bestEnding, nodeId })
    .where(eq(activitySessions.sessionId, sessionId));
  await db
    .update(gameSessions)
    .set({ questionCount: item.position + 1, lastActivityAt: now })
    .where(eq(gameSessions.id, sessionId));
  return result;
}
