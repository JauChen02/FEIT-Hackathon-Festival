import { and, eq, sql } from 'drizzle-orm';
import {
  AppError,
  computePoints,
  deriveSignals,
  localDateFor,
  matchOutcome,
  seededRandom,
  uuidv7,
  weightedQuestionPool,
  type AnswerKey,
  type MultiplayerMode,
  type PointsBreakdown,
  type StreakState,
} from '@learnarena/core';
import {
  addToCachedTotal,
  activeEventMultiplier,
  categories,
  creditStreak,
  friendBonusGrants,
  friendships,
  gameSessions,
  gameTypes,
  insertLedgerRow,
  lobbies,
  lobbyMembers,
  loadCategoryExposure,
  loadSkillProfiles,
  lockStreakUser,
  matchResults,
  pairBlocked,
  questionVersions,
  recordResolvedQuestion,
  sessionCompletionKey,
  sessionPlayers,
  sessionQuestions,
  transitionLobby,
  users,
  type Database,
} from '@learnarena/db';
import { MatchEngine, type Player } from './engine';
export interface PlayerResult {
  userId: string;
  outcome: string;
  eligible: boolean;
  finalPoints: number;
  pointsBreakdown: PointsBreakdown | null;
  streak: StreakState | null;
  review: { prompt: string; correctAnswer: string; explanation: string }[];
}
export async function startMatch(db: Database, lobbyId: string, at: Date) {
  return db.transaction(async (tx) => {
    const [lobby] = await tx.select().from(lobbies).where(eq(lobbies.id, lobbyId)).for('update');
    if (!lobby || lobby.status !== 'STARTING') throw new AppError('INVALID_SESSION_STATE');
    const members = await tx
      .select({ userId: users.id, displayName: users.displayName })
      .from(lobbyMembers)
      .innerJoin(users, eq(users.id, lobbyMembers.userId))
      .where(eq(lobbyMembers.lobbyId, lobbyId))
      .orderBy(lobbyMembers.joinedAt, users.id);
    const mode = lobby.gameType as MultiplayerMode;
    if (
      members.length < (mode === 'quiz_coop' ? 2 : 4) ||
      (mode === 'team_deathmatch' && members.length % 2 !== 0)
    )
      throw new AppError('INVALID_INPUT');
    for (const a of members)
      for (const b of members)
        if (a.userId < b.userId && (await pairBlocked(tx, a.userId, b.userId)))
          throw new AppError('FORBIDDEN');
    const [game] = await tx.select().from(gameTypes).where(eq(gameTypes.slug, mode));
    if (!game || game.status !== 'ENABLED') throw new AppError('FORBIDDEN');
    const all = await tx
      .select({ version: questionVersions, category: categories })
      .from(questionVersions)
      .innerJoin(categories, eq(categories.id, questionVersions.categoryId))
      .where(and(eq(questionVersions.status, 'LIVE'), eq(categories.status, 'LAUNCH')))
      .orderBy(questionVersions.id);
    const pool = all.map(({ version: q }) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.optionsJson as { id: string; text: string }[] | null,
      answer: q.answerJson as AnswerKey,
      explanation: q.explanation,
      categoryId: q.categoryId,
      rating: Number(q.rating),
      subTopic: q.subTopic,
    }));
    const weakness: Record<string, number> = {};
    for (const member of members) {
      const profiles = await loadSkillProfiles(tx, member.userId);
      const exposure = await loadCategoryExposure(
        tx,
        member.userId,
        new Date(at.getTime() - 60 * 86400000),
      );
      for (const id of new Set(pool.map((q) => q.categoryId))) {
        const row = exposure.get(id);
        const value = deriveSignals({
          categorySlug: id,
          rating: profiles.get(id)?.rating ?? 1000,
          exposureCount: row?.exposureCount ?? 0,
          recencyDays: row?.lastEventAt
            ? (at.getTime() - row.lastEventAt.getTime()) / 86400000
            : null,
        }).weaknessScore;
        weakness[id] = (weakness[id] ?? 0) + value / members.length;
      }
    }
    const id = uuidv7();
    const count = mode === 'quiz_coop' ? 10 : 15;
    const questions = weightedQuestionPool(pool, weakness, count, seededRandom(id).next);
    if (questions.length < count)
      throw new AppError('INVALID_INPUT', {
        message: 'Not enough published questions for this match.',
      });
    const players: Player[] = members.map((m, i) => ({
      ...m,
      team: mode === 'quiz_coop' ? 'A' : i % 2 === 0 ? 'A' : 'B',
      connected: true,
      disconnectedAt: null,
      eliminated: false,
    }));
    await tx.insert(gameSessions).values({
      id,
      gameTypeId: game.id,
      mode: game.mode,
      ownerId: lobby.hostId,
      status: 'ACTIVE',
      weaknessTier: 'NONE',
      weaknessSnapshotJson: { poolWeakness: weakness },
      creationIdempotencyKey: id,
      questionCount: count,
      timeLimitMs: mode === 'quiz_coop' ? 20000 : 15000,
      createdAt: at,
      startedAt: at,
      lastActivityAt: at,
    });
    await tx
      .insert(sessionQuestions)
      .values(
        questions.map((q, i) => ({ sessionId: id, position: i + 1, questionVersionId: q.id })),
      );
    await transitionLobby(tx, lobbyId, 'STARTING', 'IN_MATCH', at);
    await tx.update(lobbies).set({ sessionId: id }).where(eq(lobbies.id, lobbyId));
    const engine = new MatchEngine(id, mode, players, questions);
    engine.start(at.getTime());
    return engine;
  });
}
export async function finalizeMatch(
  db: Database,
  lobbyId: string,
  engine: MatchEngine,
  at: Date,
): Promise<PlayerResult[]> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, engine.id))
      .for('update');
    if (!session) throw new Error('Missing match session');
    const [existing] = await tx
      .select()
      .from(matchResults)
      .where(eq(matchResults.sessionId, engine.id));
    if (existing) return (existing.resultJson as { players: PlayerResult[] }).players;
    if (session.status !== 'ACTIVE' || engine.status !== 'FINALIZING')
      throw new Error('Invalid match finalization');
    const eligible = new Set(
      engine.players
        .filter(
          (p) =>
            engine.rounds.filter((r) => !r.perPlayer.find((x) => x.userId === p.userId)!.timedOut)
              .length /
              engine.rounds.length >=
            0.5,
        )
        .map((p) => p.userId),
    );
    const profiles = new Map<string, typeof users.$inferSelect>();
    for (const player of [...engine.players].sort((a, b) => a.userId.localeCompare(b.userId))) {
      const user = await lockStreakUser(tx, player.userId);
      if (!user || user.deletedAt) throw new Error('Unavailable match participant');
      profiles.set(player.userId, user);
    }
    const counts: Record<string, number> = {};
    const utcDate = at.toISOString().slice(0, 10);
    const ordered = [...eligible].sort();
    for (let i = 0; i < ordered.length; i++)
      for (let j = i + 1; j < ordered.length; j++) {
        const low = ordered[i]!,
          high = ordered[j]!;
        if ((counts[low] ?? 0) >= 3 || (counts[high] ?? 0) >= 3) continue;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`friend:${low}:${high}`}))`);
        const [friend] = await tx
          .select()
          .from(friendships)
          .where(
            and(
              eq(friendships.userLowId, low),
              eq(friendships.userHighId, high),
              eq(friendships.status, 'ACCEPTED'),
            ),
          );
        if (
          !friend?.acceptedAt ||
          friend.acceptedAt.getTime() > engine.startedAt - 86400000 ||
          (await pairBlocked(tx, low, high))
        )
          continue;
        const prior = await tx
          .select()
          .from(friendBonusGrants)
          .where(
            and(
              eq(friendBonusGrants.userLowId, low),
              eq(friendBonusGrants.userHighId, high),
              eq(friendBonusGrants.utcDate, utcDate),
            ),
          );
        if (prior.length >= 5) continue;
        await tx.insert(friendBonusGrants).values({
          id: uuidv7(),
          sessionId: engine.id,
          userLowId: low,
          userHighId: high,
          utcDate,
          ordinal: prior.length + 1,
        });
        counts[low] = (counts[low] ?? 0) + 1;
        counts[high] = (counts[high] ?? 0) + 1;
      }
    await tx
      .insert(sessionPlayers)
      .values(
        engine.players.map((p) => ({ sessionId: engine.id, userId: p.userId, team: p.team })),
      );
    for (let i = 0; i < engine.rounds.length; i++) {
      const round = engine.rounds[i]!,
        question = engine.questions[i]!;
      await tx
        .update(sessionQuestions)
        .set({
          servedAt: new Date(round.startedAt),
          deadlineAt: new Date(round.startedAt + (engine.mode === 'quiz_coop' ? 20000 : 15000)),
        })
        .where(
          and(eq(sessionQuestions.sessionId, engine.id), eq(sessionQuestions.position, i + 1)),
        );
      for (const player of round.perPlayer)
        await recordResolvedQuestion(tx, {
          sessionId: engine.id,
          userId: player.userId,
          gameTypeId: session.gameTypeId,
          questionVersionId: question.id,
          position: i + 1,
          categoryId: question.categoryId,
          subTopic: question.subTopic,
          difficultyRating: String(question.rating),
          outcome: player.timedOut ? 'TIMEOUT' : 'ANSWERED',
          correctness: player.correctness,
          speedFactor: String(player.speedFactor),
          responseJson: player.response,
          responseTimeMs: player.timedOut ? null : player.receivedAt - round.startedAt,
          clientSentAt: null,
          serverReceivedAt: new Date(player.receivedAt),
        });
    }
    const event = await activeEventMultiplier(tx, at);
    const results: PlayerResult[] = [];
    const winner = matchOutcome(engine.hp);
    for (const player of engine.players) {
      const user = profiles.get(player.userId)!;
      const qualifies = eligible.has(player.userId);
      const outcome =
        engine.mode === 'quiz_coop'
          ? 'COMPLETED'
          : winner === 'DRAW'
            ? 'DRAW'
            : winner === player.team
              ? 'WIN'
              : 'LOSS';
      const review = engine.rounds.flatMap((r, i) =>
        r.perPlayer.some((p) => p.team === player.team && p.correctness < 1)
          ? [
              {
                prompt: engine.questions[i]!.prompt,
                correctAnswer: r.correctAnswer,
                explanation: r.explanation,
              },
            ]
          : [],
      );
      let breakdown: PointsBreakdown | null = null;
      let streak: StreakState | null = null;
      if (qualifies) {
        const credited = await creditStreak({
          tx,
          userId: user.id,
          sessionId: engine.id,
          localDate: localDateFor(user.timezone, at),
          isQualifying: true,
          now: at,
        });
        streak = credited.streak;
        breakdown = computePoints({
          questions: engine.rounds.map((r) =>
            engine.mode === 'quiz_coop'
              ? { correctness: r.teamCorrectness, speedFactor: r.teamSpeedFactor }
              : r.perPlayer.find((p) => p.userId === player.userId)!,
          ),
          completionBonus: 50 + (outcome === 'WIN' ? 100 : outcome === 'DRAW' ? 50 : 0),
          multipliers: {
            streak: credited.streakMultiplier,
            friend: 1 + 0.1 * (counts[user.id] ?? 0),
            weakness: 1,
            event: event?.multiplier ?? 1,
          },
        });
        if (event) breakdown.event = event;
        const inserted = await insertLedgerRow(tx, {
          userId: user.id,
          sessionId: engine.id,
          reason: 'SESSION_COMPLETION',
          breakdown,
          idempotencyKey: sessionCompletionKey(engine.id, user.id),
          now: at,
        });
        if (inserted) await addToCachedTotal(tx, user.id, breakdown.finalPoints, at);
      }
      results.push({
        userId: user.id,
        outcome,
        eligible: qualifies,
        finalPoints: breakdown?.finalPoints ?? 0,
        pointsBreakdown: breakdown,
        streak,
        review,
      });
    }
    const result = { mode: engine.mode, hp: engine.hp, rounds: engine.rounds, players: results };
    await tx
      .insert(matchResults)
      .values({ sessionId: engine.id, resultJson: result, createdAt: at });
    await tx
      .update(gameSessions)
      .set({
        status: 'COMPLETED',
        endedAt: at,
        lastActivityAt: at,
        resultJson: { multiplayer: true, ...result },
        isQualifying: eligible.has(session.ownerId),
        localDate: localDateFor(profiles.get(session.ownerId)!.timezone, at),
      })
      .where(and(eq(gameSessions.id, engine.id), eq(gameSessions.status, 'ACTIVE')));
    await transitionLobby(tx, lobbyId, 'IN_MATCH', 'CLOSED', at);
    return results;
  });
}
export async function abortMatch(db: Database, lobbyId: string, sessionId: string, at: Date) {
  await db.transaction(async (tx) => {
    await tx
      .update(gameSessions)
      .set({ status: 'CANCELLED', endedAt: at })
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.status, 'ACTIVE')));
    await tx
      .update(lobbies)
      .set({ status: 'CLOSED', updatedAt: at })
      .where(and(eq(lobbies.id, lobbyId), eq(lobbies.status, 'IN_MATCH')));
  });
}
