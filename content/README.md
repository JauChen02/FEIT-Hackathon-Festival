# Content

Reviewed question content for the MVP publishing pipeline (PLANNING.md §13.4,
ADR-020). Review happens through pull request; `pnpm content:import` publishes.

## File layout

One JSON file per question **version** (ADR-025):

```
content/<category>/<externalId>.v<versionNumber>.json
```

The filename must match the `externalId` and `versionNumber` inside it — the
importer rejects a mismatch, which is what catches a copy-paste that forgot to
bump the version.

## Shape

```jsonc
{
  "externalId": "math-fractions-0001", // 3..64 chars of [a-z0-9-], stable forever
  "versionNumber": 1,
  "category": "math", // must be a seeded category slug
  "subTopic": "fractions", // optional, stored on learning events
  "type": "MCQ", // or "NUMERIC"
  "difficulty": 2, // 1..5 — editorial metadata (§11.2)
  "prompt": "What is 3/4 + 1/8?",
  "options": [
    // MCQ only, 2..6 entries
    { "id": "a", "text": "4/12" },
    { "id": "b", "text": "7/8" },
  ],
  "answer": { "correctOptionId": "b" }, // NUMERIC: {"value":"0.875","tolerance":"0.001"}
  "explanation": "Rewrite 3/4 as 6/8, then 6/8 + 1/8 = 7/8.",
  "origin": "DEV_SEED", // HUMAN | AI_GENERATED | DEV_SEED
  "source": "Authored for the LearnArena development seed",
  "license": "internal",
  "authorUsername": "seed_author",
  "reviewedByUsername": "seed_reviewer", // MUST differ from the author (§13.1)
  "reviewedAt": "2026-09-20T00:00:00Z",
}
```

There is no `rating` field. The importer derives it as `700 + 100 × difficulty`
(ADR-009), so it can never drift from the difficulty.

## Rules

- **Published versions are immutable** (§13.2, ADR-008). Editing an
  assessment-critical field of a published version is rejected; add
  `<externalId>.v2.json` instead. Publishing v2 archives v1 in the same
  transaction, and historical answers keep rendering the version the learner
  actually saw.
- Metadata-only edits (`source`, `license`, `reviewedAt`) are fine in place:
  they are outside the content hash (ADR-030).
- Every version needs a real explanation. §13.6 forbids filler, and the schema
  enforces a minimum length.
- `AI_GENERATED` content still passes through human review — there is no path
  from DRAFT to LIVE without it (§13.3).
- Externally sourced material **must** record its real `source` and `license`.

## Commands

```bash
pnpm content:import              # publish everything under content/
pnpm content:import --dry-run    # validate and report, write nothing
pnpm content:import --dir path   # import from somewhere else
```

The import validates every file before writing anything, so a bad file in a pull
request cannot half-publish. Re-running over unchanged files writes nothing at
all.

## Current contents

The development seed (`origin: DEV_SEED`, never imported into production):
15 questions in each of `math`, `logic` and `science` — 3 at each difficulty
1 to 5 — a mix of MCQ and NUMERIC. §13.6's launch target of ≥ 150 reviewed
questions per category is a pre-launch task, not a Phase 0 one.
