/**
 * State-machine helper (PLANNING.md §15).
 *
 * "Transitions are implemented in one module per entity (`*&#47;transitions.ts`) that
 * exposes `canTransition(from, to)` and a guarded update. Illegal transitions
 * throw `INVALID_STATE_TRANSITION` and are unit-tested exhaustively (every pair)."
 *
 * The guarded UPDATE itself lives in packages/db (it is I/O); this module owns
 * the legality rules, which are pure.
 */

import { InvalidStateTransitionError } from '../errors';

export interface TransitionTable<S extends string> {
  /** Entity name, used in error messages. */
  readonly entity: string;
  /** Every state, in declaration order. */
  readonly states: readonly S[];
  /** States with no outgoing transitions. */
  readonly terminalStates: readonly S[];
  /** Legal successor states for each state. */
  readonly allowed: Readonly<Record<S, readonly S[]>>;
  canTransition(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  isTerminal(state: S): boolean;
  /** Every legal (from, to) pair. */
  legalPairs(): readonly (readonly [S, S])[];
}

export function makeTransitionTable<S extends string>(
  entity: string,
  states: readonly S[],
  allowed: Readonly<Record<S, readonly S[]>>,
): TransitionTable<S> {
  const stateSet = new Set<string>(states);

  for (const [from, targets] of Object.entries(allowed) as [S, readonly S[]][]) {
    if (!stateSet.has(from)) {
      throw new Error(`${entity} transition table declares unknown state ${from}`);
    }
    for (const to of targets) {
      if (!stateSet.has(to)) {
        throw new Error(`${entity} transition table maps ${from} to unknown state ${to}`);
      }
    }
  }

  const terminalStates = states.filter((state) => (allowed[state] ?? []).length === 0);

  return {
    entity,
    states,
    terminalStates,
    allowed,
    canTransition(from, to) {
      return (allowed[from] ?? []).includes(to);
    },
    assertTransition(from, to) {
      if (!(allowed[from] ?? []).includes(to)) {
        throw new InvalidStateTransitionError(entity, from, to);
      }
    },
    isTerminal(state) {
      return (allowed[state] ?? []).length === 0;
    },
    legalPairs() {
      return states.flatMap((from) => (allowed[from] ?? []).map((to) => [from, to] as const));
    },
  };
}
