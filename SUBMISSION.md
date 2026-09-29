# Submission guide

## Fast local demonstration

Docker must be running. From the repository root:

```bash
pnpm install
pnpm setup:local
pnpm build
pnpm start
```

- App: http://localhost:3000
- Captured sign-in emails: http://127.0.0.1:54324
- Multiplayer health: http://localhost:3001

Use email sign-in and open its magic link from Mailpit. Complete onboarding. Start with a quiz, review the result, then try the other games. Use a second browser profile for co-op. Team deathmatch needs four accounts. Newly accepted friendships become eligible for the friend reward bonus after 24 hours; multiplayer itself can be played immediately.

The local setup includes demo content and daily challenges. It does not need paid AI credentials. Skills and coaching update asynchronously, normally within a worker polling cycle. Keep the terminal running during the demo. Stop an old app instance before starting a new one if a port is occupied.

## Push your branch

Changes are left in the working tree on `JauChen`. Review and commit the source and lockfile. `.env.local` is ignored and must stay private. Pushing source does not publish a live site.

## Hosted configuration

Use Node 22+ with pnpm and install the complete workspace. Supply the environment variables from `.env.example` through the host's secret settings; do not upload the local Docker credentials as production credentials.

1. Configure Supabase/Postgres, Auth email delivery and allowed callback URL `https://YOUR_WEB_HOST/auth/callback`. Set database URL, public Supabase URL/anon key and server-only service-role key.
2. Configure Redis HTTP credentials, a random shared `REALTIME_TOKEN_SECRET`, the public web origin and the public realtime URL. Public environment values must be available during the Next.js build.
3. Apply migrations with `pnpm db:migrate`. Import approved content for production. `pnpm db:seed` is for local/test/preview demo data and refuses DEV_SEED content in production.
4. Build with `pnpm build`. Run three persistent services from the same repository:

| Service  | Start command                                                  | Configuration                                    |
| -------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Web      | `pnpm --filter @learnarena/web exec next start --port "$PORT"` | Set PORT to the host's assigned web port         |
| Realtime | `pnpm --filter @learnarena/realtime start`                     | PORT defaults to 3001; enable WebSocket proxying |
| Worker   | `pnpm --filter @learnarena/web worker`                         | Same database and optional provider credentials  |

Set `BACKGROUND_JOB_MODE=worker` on web and realtime. Run one realtime instance and one worker for this submission. The current realtime recovery assumes a single server; do not horizontally scale it without shared match ownership. The root `pnpm start` command is convenient locally, while hosted services should use the separate commands above.

Alternatively configure Inngest at `/api/inngest` with its signing/event keys, set `BACKGROUND_JOB_MODE=inngest` and omit the polling worker. Do not run both scheduling systems together.

For trusted proxy IP throttling, set `TRUSTED_CLIENT_IP_HEADER` to a header your proxy always overwrites. Push needs HTTPS (localhost is allowed), VAPID keys and consent. Anthropic credentials are optional; missing credentials produce template coaching.

## Validation and limits

Production compilation and local stack initialization succeeded. Final test suites were intentionally not rerun at the user's request. Earlier targeted domain, database and browser checks are documented in IMPLEMENTATION_STATUS.md. Full deathmatch browser coverage, load testing, accessibility audit, production service provisioning and public deployment remain outside this submission verification. No hosted URL has been created.
