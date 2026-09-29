# LearnArena

A gamified learning platform: solo quizzes, interactive scenarios, co-op quizzes
and team "knowledge deathmatch", driven by streaks, multiplicative points,
social bonuses, weekly leaderboards, and a deterministic Coach that finds each
learner's weak areas and rewards them for working on those areas.

- **[PLANNING.md](PLANNING.md)** — the implementation specification. Single
  source of truth.
- **[DECISIONS.md](DECISIONS.md)** — architectural decision records.

**Current stage: Phase 1 complete.** Sign-in, onboarding, the full MVP schema,
the content pipeline and the dev seed (Phase 0); plus the solo quiz loop, the
points ledger and the results review (Phase 1). Streaks arrive in Phase 2 and
the Coach in Phase 3.

## Getting started

Prerequisites: Node 22+, pnpm 11+, and **Docker running** (the local Supabase
stack needs it).

```bash
pnpm install
pnpm supabase start          # Postgres, Auth and Mailpit on localhost
cp .env.example .env.local   # then paste in the keys `supabase start` printed

pnpm db:migrate              # apply the checked-in migrations
pnpm db:seed                 # taxonomy, content users, 45 questions, fixtures

pnpm dev                     # http://localhost:3000

# Optional, in a second terminal: the Inngest dev server, so the background
# jobs actually run. Without it, `session/terminal` sends fail and are logged —
# which is the designed behaviour (§23.4: sessions/reconcile retries), but it
# does mean an error line per completed quiz.
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Sign in at `/sign-in` with any email address; the local stack captures the
magic link at <http://127.0.0.1:54324> (Mailpit) instead of sending it.

## Layout

```
apps/web/          Next.js App Router — UI, route handlers
packages/core/     pure domain logic, no I/O: clock, ids, errors, schemas,
                   time, content hashing, state-transition tables
packages/db/       Drizzle schema, migrations, repositories, CLI commands
content/           reviewed question JSON (see content/README.md)
```

`packages/core` holds everything that must be unit-testable and shared between
the web app and the future realtime server. It performs no I/O, reads no
wall-clock time and uses no unseeded randomness (PLANNING.md §29).

## Commands

| Command               | What it does                                                                 |
| --------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`            | Run the web app                                                              |
| `pnpm lint`           | ESLint across the workspace                                                  |
| `pnpm typecheck`      | `tsc --noEmit` in every package                                              |
| `pnpm test`           | Unit tests (`packages/core`) + integration tests (`packages/db`, `apps/web`) |
| `pnpm test:e2e`       | Playwright, against a real build and real Supabase Auth                      |
| `pnpm db:migrate`     | Apply migrations                                                             |
| `pnpm db:seed`        | Seed taxonomy, content users, questions and fixture users                    |
| `pnpm db:reset`       | Drop, re-migrate, re-seed (local/test only)                                  |
| `pnpm content:import` | Publish `content/` — idempotent, refuses edits to published versions         |

Integration and E2E tests need the Supabase stack running. They create and drop
their own throwaway databases, so they never touch your development data.

## Working on this

Read PLANNING.md §29 (Agent Operating Instructions) first. In short: implement
only the current phase, use only the canonical stack in §21.1, keep domain logic
pure in `packages/core`, and record every non-trivial interpretation in
DECISIONS.md.

Visual design is deliberately minimal — see ADR-021. All design tokens live in
`apps/web/app/globals.css`; components carry no colours of their own.
