/**
 * Content hashing for question versions (PLANNING.md §13.2, §13.5; ADR-030).
 *
 * The hash covers the **assessment-critical fields only** — the ones §13.2
 * declares immutable once a version leaves DRAFT:
 *
 *   type, prompt, options_json, answer_json, explanation, category, sub_topic,
 *   difficulty, rating
 *
 * Metadata (source, license, author, reviewer, timestamps) is deliberately
 * excluded, so correcting a licence note does not force a new version, while any
 * change a learner could see does.
 *
 * The importer compares this hash against the stored one to enforce
 * immutability: same version number + different hash is an error, not an update.
 */

import { sha256 } from '../crypto/sha256';

export interface AssessmentCriticalFields {
  type: string;
  prompt: string;
  optionsJson: unknown;
  answerJson: unknown;
  explanation: string;
  categorySlug: string;
  subTopic: string | null;
  difficulty: number;
  rating: number;
}

/**
 * Deterministic JSON: object keys sorted, arrays left in order (option order is
 * assessment-critical — it is what the learner saw).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonicalJson: non-finite numbers are not representable');
    }
    // Normalise -0 to 0 so it cannot produce two hashes for one value.
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
}

/** Lowercase hex SHA-256 over the canonical form of the assessment-critical fields. */
export function contentHash(fields: AssessmentCriticalFields): string {
  return sha256(
    canonicalJson({
      type: fields.type,
      prompt: fields.prompt,
      optionsJson: fields.optionsJson ?? null,
      answerJson: fields.answerJson ?? null,
      explanation: fields.explanation,
      categorySlug: fields.categorySlug,
      subTopic: fields.subTopic ?? null,
      difficulty: fields.difficulty,
      rating: fields.rating,
    }),
  );
}
