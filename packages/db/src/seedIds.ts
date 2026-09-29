/**
 * Deterministic ids for seed data (PLANNING.md §13.6: "Seeds are deterministic
 * (fixed ids and PRNG seeds)").
 *
 * Hashing a stable name into a UUID beats a table of hand-written literals: the
 * ids never collide, tests can recompute any of them from the same name, and
 * adding a fixture does not mean inventing another 32 hex digits by hand.
 *
 * The version nibble is 8 — RFC 9562's "custom" UUID version, which is exactly
 * what these are. That also makes seed rows trivially distinguishable from
 * application rows, which carry v7 ids.
 */

import { sha256 } from '@learnarena/core';

export function seedId(namespace: string, name: string): string {
  const hex = sha256(`learnarena:seed:${namespace}:${name}`);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

export const seedIds = {
  category: (slug: string) => seedId('category', slug),
  gameType: (slug: string) => seedId('game_type', slug),
  user: (username: string) => seedId('user', username),
  session: (username: string, index: number) => seedId('session', `${username}:${index}`),
  answer: (username: string, sessionIndex: number, position: number) =>
    seedId('answer', `${username}:${sessionIndex}:${position}`),
  learningEvent: (username: string, sessionIndex: number, position: number) =>
    seedId('learning_event', `${username}:${sessionIndex}:${position}`),
  skillUpdate: (username: string, sessionIndex: number, position: number) =>
    seedId('skill_update', `${username}:${sessionIndex}:${position}`),
};
