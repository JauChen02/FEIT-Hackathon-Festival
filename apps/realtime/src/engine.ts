import {
  gradeAnswer,
  matchTransitions,
  realtimeSchemas,
  resolveMatchRound,
  uuidv7,
  type AnswerResponse,
  type MatchQuestion,
  type MatchVote,
  type MultiplayerMode,
  type ResolvedRound,
  type Team,
} from '@learnarena/core';
export type MatchStatus =
  'WAITING_FOR_PLAYERS' | 'IN_PROGRESS' | 'FINALIZING' | 'FINISHED' | 'ABORTED';
export interface Player {
  userId: string;
  displayName: string;
  team: Team;
  connected: boolean;
  disconnectedAt: number | null;
  eliminated: boolean;
}
export interface Ack {
  clientEventId: string;
  accepted: boolean;
  reason?: string;
}
/** Authoritative state; the adapter supplies time and persists only terminal results. */
export class MatchEngine {
  status: MatchStatus = 'WAITING_FOR_PLAYERS';
  roundIndex = 0;
  roundId = uuidv7();
  startedAt = 0;
  roundStartedAt = 0;
  deadlineAt = 0;
  hp: Record<Team, number> = { A: 100, B: 100 };
  rounds: ResolvedRound[] = [];
  votes = new Map<string, MatchVote>();
  combos: Record<string, number> = {};
  acks = new Map<string, Ack>();
  constructor(
    readonly id: string,
    readonly mode: MultiplayerMode,
    readonly players: Player[],
    readonly questions: MatchQuestion[],
  ) {}
  transition(to: MatchStatus) {
    matchTransitions.assertTransition(this.status, to);
    this.status = to;
  }
  start(now: number) {
    this.transition('IN_PROGRESS');
    this.startedAt = now;
    this.openRound(now);
  }
  openRound(now: number) {
    this.roundId = uuidv7();
    this.roundStartedAt = now;
    this.deadlineAt = now + (this.mode === 'quiz_coop' ? 20000 : 15000);
    this.votes.clear();
  }
  submit(userId: string, eventName: 'vote' | 'submit_answer', payload: unknown, now: number): Ack {
    const parsed = realtimeSchemas[eventName].safeParse(payload);
    if (!parsed.success) return { clientEventId: '', accepted: false, reason: 'INVALID_INPUT' };
    const event = parsed.data;
    const key = `${userId}:${event.clientEventId}`;
    const previous = this.acks.get(key);
    if (previous) return previous;
    let reason: string | undefined;
    const player = this.players.find((p) => p.userId === userId);
    const question = this.questions[this.roundIndex];
    if (!player || !player.connected || player.eliminated) reason = 'FORBIDDEN';
    else if (this.status !== 'IN_PROGRESS' || !question) reason = 'INVALID_SESSION_STATE';
    else if ((this.mode === 'quiz_coop') !== (eventName === 'vote')) reason = 'INVALID_INPUT';
    else if ('roundId' in event ? event.roundId !== this.roundId : event.questionId !== question.id)
      reason = 'QUESTION_NOT_CURRENT';
    else if (now > this.deadlineAt + 500) reason = 'QUESTION_EXPIRED';
    else if (this.votes.has(userId)) reason = 'ALREADY_ANSWERED';
    if (!reason && question) {
      try {
        gradeAnswer(question.type, question.answer, event.response);
        if (
          question.type === 'MCQ' &&
          (!('optionId' in event.response) ||
            !question.options?.some(
              (o) => o.id === ('optionId' in event.response ? event.response.optionId : ''),
            ))
        )
          reason = 'INVALID_INPUT';
      } catch {
        reason = 'INVALID_INPUT';
      }
    }
    const ack: Ack = {
      clientEventId: event.clientEventId,
      accepted: !reason,
      ...(reason ? { reason } : {}),
    };
    this.acks.set(key, ack);
    if (!reason)
      this.votes.set(userId, {
        userId,
        response: event.response as AnswerResponse,
        receivedAt: now,
      });
    return ack;
  }
  shouldResolve(now: number) {
    return (
      this.status === 'IN_PROGRESS' &&
      (now >= this.deadlineAt + 500 || this.votes.size === this.players.length)
    );
  }
  resolve(now: number) {
    if (this.status !== 'IN_PROGRESS') throw new Error('Round is not active');
    const question = this.questions[this.roundIndex]!;
    const result = resolveMatchRound({
      mode: this.mode,
      question,
      players: this.players,
      votes: [...this.votes.values()],
      startedAt: this.roundStartedAt,
      lockedAt: now,
      combos: this.combos,
      hp: this.hp,
    });
    this.rounds.push(result);
    this.hp = result.hp;
    for (const player of result.perPlayer) this.combos[player.userId] = player.combo;
    this.roundIndex++;
    if (
      this.roundIndex >= this.questions.length ||
      (this.mode === 'team_deathmatch' && (this.hp.A <= 0 || this.hp.B <= 0))
    )
      this.transition('FINALIZING');
    else this.openRound(now);
    return result;
  }
  disconnect(userId: string, now: number) {
    const player = this.players.find((p) => p.userId === userId);
    if (player) {
      player.connected = false;
      player.disconnectedAt = now;
    }
  }
  reconnect(userId: string, now: number) {
    const player = this.players.find((p) => p.userId === userId);
    if (
      !player ||
      player.eliminated ||
      player.disconnectedAt === null ||
      now - player.disconnectedAt > 30000
    )
      return false;
    player.connected = true;
    player.disconnectedAt = null;
    return true;
  }
  expireDisconnected(now: number) {
    for (const player of this.players)
      if (player.disconnectedAt !== null && now - player.disconnectedAt > 30000)
        player.eliminated = true;
    if (
      this.players.every((p) => p.eliminated) &&
      ['WAITING_FOR_PLAYERS', 'IN_PROGRESS'].includes(this.status)
    )
      this.transition('ABORTED');
  }
  snapshot(userId: string) {
    const q = this.questions[this.roundIndex];
    return {
      sessionId: this.id,
      status: this.status,
      mode: this.mode,
      round: this.roundIndex + 1,
      totalRounds: this.questions.length,
      roundId: this.roundId,
      deadlineAt: this.deadlineAt,
      hp: this.hp,
      players: this.players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        team: p.team,
        connected: p.connected,
      })),
      answered: this.votes.has(userId),
      question:
        this.status === 'IN_PROGRESS' && q
          ? { id: q.id, prompt: q.prompt, type: q.type, options: q.options }
          : null,
      previousRound: this.rounds.at(-1) ?? null,
    };
  }
}
