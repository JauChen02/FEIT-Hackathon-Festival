# LearnArena

A learning game with quizzes, speed math, memory recall, branching scenarios, co-op quizzes and team knowledge deathmatch. Includes streaks and freezes, daily challenges, weekly leaderboards, friends, skill recommendations, achievements, event bonuses, content publishing and privacy controls.

## Run locally

Requires Node 22+, pnpm 11+ and Docker running.

```bash
pnpm install
pnpm setup:local
pnpm build
pnpm start
```

Open **http://localhost:3000**. Sign in with an email address, open the magic link in **http://127.0.0.1:54324** (local Mailpit), then complete onboarding. Local email is captured, not delivered to your inbox. Google sign-in requires separate provider configuration; use email for the local demo.

`setup:local` starts Supabase and Redis, creates missing `.env.local` settings, applies migrations, seeds playable content and publishes daily challenges for yesterday, today and tomorrow. It preserves existing nonempty environment values. Never commit `.env.local`.

`pnpm start` starts the production web app, the multiplayer server on port 3001 and a background worker. The worker updates skills, coaching, achievements and projections without requiring an Inngest account. For development, use `pnpm dev` instead. Stop with Ctrl+C.

## Demo

1. Complete a quiz from Home; review answers, points and streak credit.
2. Open Games to try speed math, memory recall and interactive scenarios.
3. Finish the daily challenge and inspect Skills, Leaderboard and Achievements.
4. Sign into another account in a private browser window. Add the accounts as friends or share a lobby code. Ready both players to start co-op; deathmatch requires four players, two per team.
5. Settings contains timezone, reminders, data export and account deletion.

For the content tools, finish onboarding and grant your username a role:

```bash
pnpm admin:grant-role YOUR_USERNAME ADMIN
```

Open `/admin/content`, `/admin/activities`, `/admin/challenges` or `/admin/events`. Publishing reviewed content requires a reviewer distinct from its author; grant another account `REVIEWER` to demonstrate that workflow.

## Operations

| Command                                 | Purpose                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| `pnpm setup:local`                      | Prepare the complete local stack and demo content        |
| `pnpm dev`                              | Web, realtime and worker with development web server     |
| `pnpm build`                            | Compile web and check realtime TypeScript                |
| `pnpm start`                            | Run the built app, realtime and worker                   |
| `pnpm db:migrate`                       | Apply checked-in migrations                              |
| `pnpm db:seed`                          | Import demo taxonomy, content and fixture users          |
| `pnpm admin:daily-challenge YYYY-MM-DD` | Publish a daily challenge from live questions            |
| `pnpm admin:grant-role USERNAME ROLE`   | Grant ADMIN, AUTHOR or REVIEWER                          |
| `pnpm admin:process-skills`             | Process outstanding learning events once                 |
| `pnpm admin:check-consistency`          | Repair derived totals, streaks and missing result caches |
| `pnpm admin:rebuild-streaks`            | Rebuild streak projections                               |
| `pnpm admin:rebuild-totals`             | Rebuild point totals from the ledger                     |

## Hosting

See [SUBMISSION.md](SUBMISSION.md) for the submission checklist and service configuration. The repository runs locally; it is not automatically deployed by pushing a branch. A hosted installation needs Postgres/Supabase Auth, Redis, a web process, a persistent Socket.IO process and background processing. `.env.example` lists configuration.

AI narration is optional: without Anthropic credentials, coaching uses deterministic templates. Push notifications require VAPID settings and browser consent. For hosted Auth, configure allowed redirect URLs and email delivery. Demo seed content is restricted outside production; production content must use the reviewed import/publishing workflow.

## Project layout

- `apps/web`: Next.js pages, API, content administration and background jobs.
- `apps/realtime`: authoritative Socket.IO multiplayer service.
- `packages/core`: scoring, streaks, game rules and validation without I/O.
- `packages/db`: Drizzle schema, migrations, repositories and seed commands.
- `content`: versioned question and activity fixtures.
- `scripts`: local setup and process orchestration.

[PLANNING.md](PLANNING.md) describes the specification, [DECISIONS.md](DECISIONS.md) records implementation choices and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) distinguishes implemented functionality from outstanding release validation.
