# LearnArena

A learning game with quizzes, speed math, memory recall, branching scenarios, co-op quizzes and team knowledge deathmatch. Includes streaks and freezes, daily challenges, weekly leaderboards, friends, skill recommendations, achievements, event bonuses, content publishing and privacy controls.

## First setup on a new laptop

Install Node.js 22 or newer, pnpm **11.10.0** (the version pinned in `package.json`), and Docker with Docker Compose. Start Docker before continuing. If pnpm is missing, install it with `npm install -g pnpm@11.10.0`.

Clone the application branch and run all commands from the repository root:

```bash
git clone --branch JauChen https://github.com/JauChen02/FEIT-Hackathon-Festival.git
cd FEIT-Hackathon-Festival
pnpm install --frozen-lockfile
pnpm setup:local
pnpm build
pnpm start
```

If you already cloned the repository, use the update instructions below. The first setup downloads Docker images and can take several minutes.

`setup:local` starts Supabase and Redis, creates missing `.env.local` settings from your local stack, applies migrations, seeds playable content and publishes daily challenges for yesterday, today and tomorrow. **You do not need to copy `.env.example` or another developer’s `.env.local`.** Existing nonempty environment values are preserved, so setup does not correct stale credentials automatically. Keep `.env.local` private.

`pnpm start` launches all three application processes: the built Next.js web app, multiplayer on port 3001, and a background worker. Leave the terminal running. The worker updates skills, coaching, achievements and projections without an Inngest account or paid AI credentials.

## Sign in locally

1. Open **http://localhost:3000** and enter your email address.
2. Open **http://127.0.0.1:54324** (Mailpit) on the same laptop. Local emails appear here, not in your real inbox.
3. Open the **newest** sign-in email and its link in the **same browser and profile** where you requested it. If clicking inside the email preview only flashes, open the link in a new tab.
4. Complete onboarding. To switch accounts, use **Sign out** in the header or Settings.

Use `localhost:3000` consistently for the app; switching to `127.0.0.1:3000` changes the cookie host. Each laptop has its own local database and Auth service: accounts, links, friends and lobbies are not shared between separate local installations. Google sign-in requires separate provider configuration; use email for this demo.

## Update an existing clone

Stop the app with Ctrl+C first. Keep Docker running, then run:

```bash
git switch JauChen
git pull --ff-only origin JauChen
pnpm install --frozen-lockfile
pnpm setup:local
pnpm build
pnpm start
```

If Git reports conflicting local work, commit or stash that work before pulling. `setup:local` reapplies pending migrations and refreshes the demo challenges without resetting the database. Rebuild after changing any `NEXT_PUBLIC_*` setting because Next.js embeds these values in the browser bundle.

## Development and shutdown

For development, use `pnpm dev` instead of `pnpm build` / `pnpm start`. It starts web, realtime and worker together. Do not run `dev` and `start` at the same time.

Ctrl+C stops the application processes. Docker services stay running. To stop those too:

```bash
docker compose -f compose.services.yml stop
pnpm supabase stop
```

Run `pnpm setup:local` to start the local services again. Do not use `db:reset` for routine updates; it destroys local database data.

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

AI narration is optional: without Anthropic credentials, coaching uses deterministic templates. Push notifications require VAPID settings and browser consent. For hosted Auth, configure allowed redirect URLs and email delivery. Demo seed content is refused in production; production content must use the reviewed import/publishing workflow.

## Project layout

- `apps/web`: Next.js pages, API, content administration and background jobs.
- `apps/realtime`: authoritative Socket.IO multiplayer service.
- `packages/core`: scoring, streaks, game rules and validation without I/O.
- `packages/db`: Drizzle schema, migrations, repositories and seed commands.
- `content`: versioned question and activity fixtures.
- `scripts`: local setup and process orchestration.

[PLANNING.md](PLANNING.md) describes the specification, [DECISIONS.md](DECISIONS.md) records implementation choices and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) distinguishes implemented functionality from outstanding release validation.

## Email link returns to sign-in

For a fresh clone, run `pnpm install` and `pnpm setup:local` on that machine, then `pnpm build` and `pnpm start`. Use http://localhost:3000 consistently. Request a new link and open the newest message from that machine’s http://127.0.0.1:54324 Mailpit in the same browser/profile as the sign-in form. Do not reuse a link from another developer’s machine or another browser profile. Keep the app on port 3000 for local Auth’s configured redirect allowlist.

If environment values changed after a production build, rebuild before restarting: public Supabase configuration is embedded in the browser bundle. Callback failures now show an explanation on the sign-in page. Share the error message for troubleshooting, never the full magic link or its token.

## Other startup problems

| Symptom                                          | What to do                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker connection error                          | Start Docker and wait for it to be ready, then rerun `pnpm setup:local`.                                                                                                        |
| Port 3000 or 3001 already in use                 | Stop the previous app instance before starting another. Both web and realtime must start successfully.                                                                          |
| Missing tables or migration errors after pulling | Run `pnpm setup:local` from the root and inspect the first error. Do not reset the database as a first step.                                                                    |
| Invalid Supabase key or URL                      | Check `.env.local` against your own `pnpm supabase status` output. Setup preserves nonempty values. Rebuild after correcting public settings. Never share the service-role key. |
| Missing daily challenge                          | Run `pnpm admin:daily-challenge YYYY-MM-DD` with the date shown in the app’s timezone, or publish it through `/admin/challenges`.                                               |
| Friends or lobbies fail while quizzes work       | Confirm Redis is running with `docker compose -f compose.services.yml ps`, and keep the realtime process running.                                                               |
| Another laptop cannot join your lobby            | Separate local stacks do not share accounts or lobbies. Use multiple browser profiles on one laptop for the local demo, or configure a shared hosted deployment.                |

The sign-in error display helps diagnose a failed callback; it does not guarantee that every browser or environment issue is resolved. If a fresh link still fails, share the displayed error and the app’s hostname/port, never the full login URL.
