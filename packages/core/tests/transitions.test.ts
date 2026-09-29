import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '../src/errors';
import {
  CONTENT_STATUSES,
  contentTransitions,
  isImmutableStatus,
  type ContentStatus,
} from '../src/transitions/content';
import { FREEZE_STATUSES, freezeTransitions } from '../src/transitions/freeze';
import {
  RECOMMENDATION_STATUSES,
  isBonusEligible,
  recommendationTransitions,
} from '../src/transitions/recommendation';
import {
  SESSION_STATUSES,
  isOpenSessionStatus,
  isTerminalSessionStatus,
  sessionTransitions,
} from '../src/transitions/session';
import { makeTransitionTable, type TransitionTable } from '../src/transitions/table';

/**
 * §15: "Illegal transitions throw INVALID_STATE_TRANSITION and are unit-tested
 * exhaustively (every pair)." §25.4 makes that a Definition-of-Done item for
 * every new status field.
 *
 * Each suite below declares the full legal set from PLANNING.md and then walks
 * the entire from × to matrix, so a table edit that is not also a spec change
 * fails here.
 */
function assertExhaustive<S extends string>(
  table: TransitionTable<S>,
  states: readonly S[],
  legal: readonly (readonly [S, S])[],
) {
  const legalKeys = new Set(legal.map(([from, to]) => `${from}->${to}`));

  it(`declares exactly ${legal.length} legal transitions`, () => {
    expect(new Set(table.legalPairs().map(([f, t]) => `${f}->${t}`))).toEqual(legalKeys);
  });

  it(`covers every one of the ${states.length * states.length} from × to pairs`, () => {
    const checked: string[] = [];
    for (const from of states) {
      for (const to of states) {
        const key = `${from}->${to}`;
        checked.push(key);
        const shouldBeLegal = legalKeys.has(key);

        expect(table.canTransition(from, to), key).toBe(shouldBeLegal);

        if (shouldBeLegal) {
          expect(() => table.assertTransition(from, to), key).not.toThrow();
        } else {
          expect(() => table.assertTransition(from, to), key).toThrow(InvalidStateTransitionError);
          expect(() => table.assertTransition(from, to), key).toThrow(/INVALID_STATE_TRANSITION/);
        }
      }
    }
    expect(checked).toHaveLength(states.length * states.length);
  });

  it('never allows a self-transition', () => {
    for (const state of states) {
      expect(table.canTransition(state, state), state).toBe(false);
    }
  });

  it('never allows a transition out of a terminal state', () => {
    for (const state of table.terminalStates) {
      for (const to of states) {
        expect(table.canTransition(state, to), `${state}->${to}`).toBe(false);
      }
    }
  });
}

/** §15.1 GameSessionStatus. */
describe('sessionTransitions', () => {
  assertExhaustive(sessionTransitions, SESSION_STATUSES, [
    ['CREATED', 'ACTIVE'],
    ['CREATED', 'CANCELLED'],
    ['CREATED', 'EXPIRED'],
    ['ACTIVE', 'COMPLETED'],
    ['ACTIVE', 'ABANDONED'],
    ['ACTIVE', 'EXPIRED'],
    ['ACTIVE', 'CANCELLED'],
  ]);

  it('treats COMPLETED, ABANDONED, EXPIRED and CANCELLED as terminal', () => {
    expect([...sessionTransitions.terminalStates].sort()).toEqual([
      'ABANDONED',
      'CANCELLED',
      'COMPLETED',
      'EXPIRED',
    ]);
  });

  it('counts CREATED and ACTIVE as open for the one-open-solo-session rule', () => {
    expect(SESSION_STATUSES.filter(isOpenSessionStatus)).toEqual(['CREATED', 'ACTIVE']);
  });

  it('agrees with the transition table about which statuses are terminal', () => {
    for (const status of SESSION_STATUSES) {
      expect(isTerminalSessionStatus(status)).toBe(sessionTransitions.isTerminal(status));
    }
  });

  it('cannot complete a session that never became ACTIVE', () => {
    expect(sessionTransitions.canTransition('CREATED', 'COMPLETED')).toBe(false);
  });

  it('cannot resume a terminal session (§8.1 replay rules)', () => {
    expect(sessionTransitions.canTransition('COMPLETED', 'ACTIVE')).toBe(false);
    expect(sessionTransitions.canTransition('ABANDONED', 'ACTIVE')).toBe(false);
    expect(sessionTransitions.canTransition('EXPIRED', 'ACTIVE')).toBe(false);
  });
});

/** §13.3 / §15.7 ContentStatus. */
describe('contentTransitions', () => {
  assertExhaustive(contentTransitions, CONTENT_STATUSES, [
    ['DRAFT', 'IN_REVIEW'],
    ['IN_REVIEW', 'DRAFT'],
    ['IN_REVIEW', 'APPROVED'],
    ['APPROVED', 'LIVE'],
    ['APPROVED', 'DRAFT'],
    ['LIVE', 'ARCHIVED'],
  ]);

  it('has no path from DRAFT to LIVE without human approval (§13.3)', () => {
    expect(contentTransitions.canTransition('DRAFT', 'LIVE')).toBe(false);
    expect(contentTransitions.canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(contentTransitions.canTransition('IN_REVIEW', 'LIVE')).toBe(false);
  });

  it('cannot bring an archived version back (§13.2)', () => {
    for (const to of CONTENT_STATUSES) {
      expect(contentTransitions.canTransition('ARCHIVED', to)).toBe(false);
    }
  });

  it('marks everything but DRAFT as immutable (§13.2)', () => {
    const immutable = CONTENT_STATUSES.filter((s: ContentStatus) => isImmutableStatus(s));
    expect(immutable).toEqual(['IN_REVIEW', 'APPROVED', 'LIVE', 'ARCHIVED']);
  });
});

/** §15.5 RecommendationStatus. */
describe('recommendationTransitions', () => {
  assertExhaustive(recommendationTransitions, RECOMMENDATION_STATUSES, [
    ['AVAILABLE', 'IN_PROGRESS'],
    ['AVAILABLE', 'EXPIRED'],
    ['IN_PROGRESS', 'AVAILABLE'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'EXPIRED'],
  ]);

  it('cannot grant the bonus twice — COMPLETED is terminal (§11.5)', () => {
    for (const to of RECOMMENDATION_STATUSES) {
      expect(recommendationTransitions.canTransition('COMPLETED', to)).toBe(false);
    }
  });

  it('treats only AVAILABLE and IN_PROGRESS as bonus-eligible (§11.8)', () => {
    expect(RECOMMENDATION_STATUSES.filter(isBonusEligible)).toEqual(['AVAILABLE', 'IN_PROGRESS']);
  });
});

/** §15.6 StreakFreezeStatus. */
describe('freezeTransitions', () => {
  assertExhaustive(freezeTransitions, FREEZE_STATUSES, [['AVAILABLE', 'CONSUMED']]);

  it('cannot un-consume a freeze', () => {
    expect(freezeTransitions.canTransition('CONSUMED', 'AVAILABLE')).toBe(false);
  });
});

describe('makeTransitionTable', () => {
  // The type system already rules these out; the runtime checks exist because a
  // table can also be built from data (e.g. enum values read from the database).
  type AnyTable = Readonly<Record<string, readonly string[]>>;

  it('rejects a table referencing an unknown source state', () => {
    expect(() =>
      makeTransitionTable('thing', ['A', 'B'], { A: ['B'], B: [], C: [] } as AnyTable),
    ).toThrow(/unknown state C/);
  });

  it('rejects a table referencing an unknown target state', () => {
    expect(() => makeTransitionTable('thing', ['A', 'B'], { A: ['Z'], B: [] } as AnyTable)).toThrow(
      /unknown state Z/,
    );
  });

  it('names the entity, from and to in the thrown error', () => {
    const table = makeTransitionTable('widget', ['A', 'B'] as const, { A: ['B'], B: [] });
    try {
      table.assertTransition('B', 'A');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStateTransitionError);
      const typed = error as InvalidStateTransitionError;
      expect(typed.entity).toBe('widget');
      expect(typed.from).toBe('B');
      expect(typed.to).toBe('A');
    }
  });
});
