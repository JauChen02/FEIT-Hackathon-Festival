# LearnArena: Architectural Decision Records

Format and rules: see PLANNING.md Appendix B. Append new ADRs at the bottom; never edit an accepted ADR except to mark it superseded.

---

## ADR-001: Target audience is 16+ self-directed learners

- Status: **Provisional** (product owner must confirm before MVP build)
- Date: 2026-09-29
- Phase: Pre-build
- Context: Audience drives privacy, moderation, tone and social features. Admitting under-16s triggers child-privacy obligations and parental consent flows.
- Decision: 16+ with age confirmation at onboarding; English-speaking, global; mobile-first web.
- Consequences: No parental-consent flow in MVP. If the audience changes to include minors, §19 privacy/safety items become release blockers from Social Beta onward.

## ADR-002: Launch categories are math, logic, science

- Status: **Provisional**
- Date: 2026-09-29
- Phase: Pre-build
- Context: Six broad categories at launch would turn content creation into an uncontrolled parallel project. Memory can't be assessed by multiple-choice quizzes.
- Decision: MVP launches with math, logic and science. Memory arrives in Alpha with `memory_match`. Language and history are deferred.
- Consequences: Coach radar has 3 axes in MVP, 4 in Alpha.

## ADR-003: Authentication required; no guest play

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Context: Guest play needs anonymous ids, expiry, migration and abuse limits.
- Decision: Users must sign up and onboard before playing.
- Consequences: Slightly higher first-play friction; much simpler data model.

## ADR-004: Consumer-first tenancy

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Users exist independently. No organizations in MVP; future classrooms/organizations will reference users.

## ADR-005: Canonical tech stack

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: As listed in PLANNING.md §21.1 (Next.js, TypeScript, Tailwind, shadcn/ui, Supabase Postgres + Auth, Drizzle, Upstash Redis, Inngest, Socket.IO, Vercel, Railway, Vitest, Playwright, Sentry, pino/Axiom, PostHog, decimal.js, @date-fns/tz).
- Consequences: The agent must not introduce alternatives for covered concerns.

## ADR-006: Postgres point ledger is the canonical points source

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: `point_ledger` is append-only and canonical. `users.total_points_cached` and Redis leaderboards are rebuildable projections. Corrections are `ADJUSTMENT` rows.

## ADR-007: Coach is category-level only in MVP

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Sub-topic is stored on learning events for summaries and analytics, but no sub-topic proficiency is modeled or displayed.

## ADR-008: Published question versions are immutable

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Assessment-critical fields live on `question_versions` and are immutable once out of `DRAFT`. Edits create new versions; one LIVE version per question.

## ADR-009: Question ratings fixed from difficulty in MVP

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Rating = 700 + 100 × difficulty (800..1200), fixed after publishing. No auto-calibration until promoted from the deferred list.

## ADR-010: Target 70% expected success (item rating = user rating − 147)

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Context: The original plan's "slightly above the user's rating" contradicted "~70% success" under the Elo formula.
- Decision: Select questions nearest to `user_rating − 147`; acceptable band 65% to 75% (−108 to −191).

## ADR-011: Solo questions are served one at a time

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Context: Speed factors must be server-measured.
- Decision: The server records `served_at`/`deadline_at` per question; speed factor uses server receive time with 1 s grace.

## ADR-012: One open solo session per user

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Enforced by a partial unique index; clients resume or abandon.

## ADR-013: Streaks are derived from stored local dates; no midnight cron

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: `streak_days` rows are written at qualifying completion using the user's timezone at that moment; freezes are consumed lazily at the next qualifying completion; display state is computed at read time.

## ADR-014: Leaderboards use immutable UTC ISO week keys

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: `YYYY-Www` in UTC for global and friends boards. Redis projection written with absolute `ZADD` from Postgres sums; rebuildable; no destructive reset.

## ADR-015: Multiplier cap applies to raw base before combo

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: `final = round_half_up(min(combo_adjusted × session_mult, raw_base × 4.0))`; rounding once at the end; decimal.js arithmetic.

## ADR-016: Improvement bonus without difficulty normalization

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Needs ≥ 3 prior qualifying sessions in the category; bonus when accuracy ≥ baseline (last 5) + 0.10. Difficulty normalization deferred; Coach targeting keeps difficulty roughly stable per user, limiting distortion.

## ADR-017: Weakness multiplier not applied in multiplayer

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Mixed-category matches use `weakness_mult = 1.0`; weakness is addressed through weighted question pools instead.

## ADR-018: Realtime match state is in memory; crash aborts the match

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: No per-event DB writes. Results are written in one transaction at match end. A crash yields `ABORTED` (session `CANCELLED`), no rewards and no learning events.
- Consequences: Rare lost matches in exchange for simplicity. Revisit if the crash rate is non-trivial.

## ADR-019: Post-commit work via Inngest with hourly reconciliation (no outbox table)

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Send `session/terminal` after commit with a deterministic event id; the hourly `sessions/reconcile` job re-sends for terminal sessions lacking `post_processed_at`.

## ADR-020: MVP content pipeline is repo JSON + PR review + import command

- Status: Accepted
- Date: 2026-09-29
- Phase: Pre-build
- Decision: Admin UI is deferred to Alpha. The import command records reviewer metadata and writes audit rows; it refuses in-place edits of existing versions.

## ADR-021: Visual design is deferred to a later Google Stitch pass

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: The UI will be redesigned later using Google Stitch via MCP. Polishing now would be thrown away, and a design pass can only move quickly if it has one place to edit.
- Decision: Build UI that is functional and easy to reskin, not polished. Unstyled/default shadcn/ui components and Tailwind layout utilities only. All colours, radii, fonts and spacing scales come from CSS variables in ONE theme file (`apps/web/app/globals.css`); no hardcoded hex colours or one-off styles. Data and presentation are separated: route/page files and hooks handle data fetching, state and API calls; presentational components in `components/ui-app/` receive plain props and contain no fetching or business logic. Every screen handles loading, empty and error states, branching on error `code`s (§16.1). No effort on animation, illustrations or visual polish.
- Consequences: Phase 0 screens look plain. `components/ui/` holds unmodified shadcn primitives; `components/ui-app/` holds LearnArena-specific presentational components. Framer Motion and Recharts are not installed until the phase that needs them.

## ADR-022: A `users` row exists only after onboarding

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §14.2 gives `users` several NOT NULL columns (`username`, `display_name`, `timezone`) that can only be collected on the onboarding screen, so a row cannot be created at signup. Something must represent "authenticated but not onboarded".
- Decision: The row is created by `POST /api/me/onboarding` and only there. The absence of a row for a Supabase auth id _is_ the onboarding-incomplete state. `onboarding_completed_at` is therefore always set on an existing row.
- Consequences: One source of truth for the state, and no partially-populated rows. Middleware cannot determine it (it runs on the edge runtime with no database), so the check lives in `requireOnboarded()` and in the server components for `/home` and `/onboarding`.

## ADR-023: Repeat onboarding returns the stored profile unchanged

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §16.2 marks `POST /api/me/onboarding` idempotent but does not say what happens when a repeat call carries _different_ values.
- Decision: The insert is `ON CONFLICT (id) DO NOTHING`; the row is then read back and returned with `200` and `created: false`. Submitted values are ignored when a row already exists. Profile edits belong to `PATCH /api/me`.
- Consequences: A retry can never mutate a profile, and a concurrent duplicate request cannot win a write race. A user who wants to change their display name uses the settings screen (Phase 2).

## ADR-024: `PATCH /api/me` is deferred to Phase 2

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: `PATCH /api/me {displayName?, timezone?}` appears in §16.2, but Phase 0's scope line does not list it, and §24 Phase 2 explicitly owns "timezone changes with the 24 h cooldown and `user_timezone_changes` audit".
- Decision: Not built in Phase 0. It ships whole in Phase 2, together with the cooldown and the audit row.
- Consequences: Display names cannot be edited in Phase 0. `user_timezone_changes` exists in the schema from Phase 0 because §14.2 tags it [MVP], but nothing writes to it yet.

## ADR-025: One content file per question version

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §13.4 says content is "authored as JSON files in `content/`" and reviewed through pull request, but does not define the granularity.
- Decision: One JSON file per question **version**, at `content/<category>/<externalId>.v<n>.json`. The importer verifies that the filename matches the `externalId` and `versionNumber` inside.
- Consequences: A new version is a new file, so pull-request diffs stay readable and a reviewer sees exactly what is being published. A forgotten version bump is caught by the filename check rather than becoming a silent no-op. `rating` is deliberately absent from the file: the importer derives it from `difficulty` (ADR-009), so an author cannot set it by hand.

## ADR-026: Content authors and reviewers are users without auth identities

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: `question_versions.author_id` and `reviewed_by` reference `users`, whose ids are Supabase auth user ids, but the dev-seed content has no human signing in to own it. §13.1 also requires the reviewer to differ from the author.
- Decision: The seed creates `seed_author` and `seed_reviewer` as ordinary `users` rows with deterministic ids (see `seedIds.ts`) and the AUTHOR / REVIEWER roles, but no Supabase auth identity, so they can never sign in. The importer resolves `authorUsername` / `reviewedByUsername` to these rows and errors clearly if they are missing.
- Consequences: The reviewer ≠ author CHECK is satisfiable for seeded content. When the Alpha admin UI arrives, real reviewers replace these for new content; existing rows keep pointing at the seed users.

## ADR-027: `GET /api/categories` is the Phase 0 onboarding-guarded route

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §24 Phase 0 requires that "gameplay routes return `ONBOARDING_REQUIRED` before onboarding", but every session endpoint belongs to Phase 1.
- Decision: `GET /api/categories` (an MVP endpoint from §16.2 that Phase 0 can implement in full — launch categories with live-question counts) carries `requireOnboarded()` and is what demonstrates the guard.
- Consequences: The guard and its test exist from Phase 0; Phase 1 applies the same `requireOnboarded()` to the session routes without new machinery.

## ADR-028: UUID v7 is implemented in `packages/core`, not taken as a dependency

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §14.1 mandates time-ordered UUID v7 ids generated server-side, but §21.1 names no UUID library, and §29 forbids adding libraries for concerns already covered.
- Decision: Implement RFC 9562 UUID v7 in `packages/core/src/ids.ts`, with a per-generator monotonic 12-bit sequence so ids are strictly increasing even within one millisecond. Unit-tested for the version nibble, the variant bits, monotonicity across 10,000 ids and sequence overflow.
- Consequences: No new dependency and no extra supply-chain surface. The generator is a class so a seed script driving it with fixed timestamps cannot perturb the application's id stream.

## ADR-029: "Reversible in local" means `pnpm db:reset`

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §24 Phase 0 requires the migration to be "reversible in local", but `drizzle-kit` does not generate down-migrations, and hand-writing one per migration is a maintenance cost with no production use (§14.4 forbids destructive production migrations anyway).
- Decision: Reversal in local means `pnpm db:reset` — drop the `public` and `drizzle` schemas, re-apply every migration, re-seed. Guarded to `APP_ENV` local/test.
- Consequences: There is a single, tested way back to a clean database. If a production rollback is ever needed it requires a new forward migration plus an ADR, which is what §14.4 already demands.

## ADR-030: The content hash covers assessment-critical fields only

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §13.5 requires a `content_hash` but does not define its input. The hash is what lets the importer refuse an edit to a published version (§13.4).
- Decision: SHA-256 over a canonical (sorted-key) JSON encoding of exactly the fields §13.2 declares immutable: `type`, `prompt`, `options_json`, `answer_json`, `explanation`, category slug, `sub_topic`, `difficulty`, `rating`. Array order is preserved, because option order is part of what the learner saw. Metadata (`source`, `license`, `author`, `reviewer`, timestamps) is excluded.
- Consequences: Correcting a licence note or attribution is an in-place update; changing anything a learner could see requires a new version. `packages/core` ships its own SHA-256 rather than importing `node:crypto`, so the module stays usable from the browser bundle.

## ADR-031: `content_audit_log.entity_type` is plain text

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §14.2 declares no enum for this column, and Alpha adds scenarios and generator templates as further audited entity kinds.
- Decision: Keep it `text`. Phase 0 writes only `'question_version'`.
- Consequences: Adding an entity kind in Alpha needs no migration. The trade-off is no database-level guarantee against a typo; the importer is the only writer in MVP, and the admin UI will be the only other one.

## ADR-032: The point ledger's append-only rule is enforced by a trigger

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §14.2 specifies "UPDATE/DELETE revoked for the app role + trigger that raises on UPDATE/DELETE" (Invariant 3). But the application connects over `DATABASE_URL` as the _owner_ of these tables, and a GRANT-based rule does not bind a table owner or a superuser at all.
- Decision: `BEFORE UPDATE` and `BEFORE DELETE` row triggers raising `restrict_violation` are the enforcement; they bind every role including superusers. The `REVOKE` statements are kept as defence in depth for the PostgREST-facing `anon` and `authenticated` roles, wrapped in a `DO` block so the migration still applies on a plain Postgres where those roles do not exist.
- Consequences: The integration test that attempts an UPDATE and a DELETE genuinely fails for the connection the application uses. Corrections remain `ADJUSTMENT` rows (§10.4).

## ADR-033: E2E magic-link sign-in uses `auth.admin.generateLink`

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §22.3 requires an end-to-end sign-up journey. Driving a real magic link means either scraping the email out of Mailpit — brittle HTML parsing, and a race against delivery — or obtaining the link another way.
- Decision: A test-only helper calls `supabase.auth.admin.generateLink` with the local service-role key and navigates the browser straight to `/auth/callback` with the returned `token_hash`. The helper reads the **`verification_type` from the response** rather than the type it asked for, because requesting a `magiclink` for an address that has never signed in creates the user and returns a `signup` token instead.
- Consequences: The real `/auth/callback` verification path, cookie handling and redirect logic are exercised; only the email delivery hop is skipped. Mailpit remains available on the local stack for manual checks.

## ADR-034: `apps/realtime` is not created in Phase 0

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §21.2 lists `apps/realtime` in the module layout, but the Socket.IO match server belongs to Multiplayer Beta (§24 Phase 8).
- Decision: Do not create the package. §29 forbids pre-building later phases, and an empty package is not a minimal interface that avoids an architectural dead end — `packages/core` already holds the pure logic the realtime server will import.
- Consequences: The monorepo has `apps/web`, `packages/core` and `packages/db`. Phase 8 adds `apps/realtime` alongside them with no restructuring.

## ADR-035: Phase 0 installs only the stack it uses

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §21.1 is the canonical stack for the whole product, not a Phase 0 shopping list. Installing everything up front adds dependencies with no call sites and makes it unclear which phase owns what.
- Decision: Phase 0 wires Next.js, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres + Auth), Drizzle, Zod, pino, Sentry (inert without a DSN), Vitest, Playwright, ESLint/Prettier and GitHub Actions. Inngest, Upstash Redis + Ratelimit, PostHog, Socket.IO, decimal.js, seedrandom, Recharts, Framer Motion, date-fns/@date-fns/tz, Resend, web-push and the Anthropic client are **not** installed; each arrives with the phase that first needs it. No alternative to a §21.1 choice is ever introduced.
- Consequences: `pnpm install` stays small and each dependency arrives with its first real use and its tests. The dev seed uses an explicit deterministic correctness pattern rather than a PRNG, so `seedrandom` is genuinely not needed until Phase 1's question selection.

## ADR-036: All six categories are seeded; only the launch three are LAUNCH

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §2.1 names a six-category long-term taxonomy but only three launch categories (ADR-002), and `categories.status` already has a `DEFERRED` value.
- Decision: Seed all six rows. `math`, `logic` and `science` get `status = 'LAUNCH'`; `memory`, `language` and `history` get `'DEFERRED'`. `GET /api/categories` returns only LAUNCH rows.
- Consequences: Adding `memory` in Alpha is a status change, not a new row with a new id, so nothing that referenced it needs to move. Deferred categories are never shown to a learner.

## ADR-037: `question_type` ships with MVP values only

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §8.1 says `mcq` and `numeric` are MVP; `order` and `match` are Alpha.
- Decision: The `question_type` enum is created with `MCQ` and `NUMERIC` only. Alpha adds the other two with `ALTER TYPE … ADD VALUE`.
- Consequences: Adding an enum value is non-destructive, so §14.4's ban on destructive production migrations is satisfied without pre-declaring types no code can handle.

## ADR-038: Tailwind v4 with tokens in `globals.css` (clarifies ADR-021)

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: ADR-021 names `tailwind.config` as part of the single theme file, but Tailwind v4 is CSS-first and normally has no config file at all. Splitting tokens across two files would give the Stitch pass two places to edit, which is exactly what ADR-021 exists to prevent.
- Decision: Tailwind v4. Every design token lives in `apps/web/app/globals.css` under `@theme`, with dark-mode overrides in the same file. `tailwind.config.ts` is retained for content globbing and plugins only and defines no tokens. Confirmed with the product owner before implementation.
- Consequences: "One theme file" is literally true. A future Stitch pass edits `globals.css` and nothing else.

## ADR-039: The dev seed includes fixture learning histories

- Status: Accepted
- Date: 2026-09-29
- Phase: 0
- Context: §13.6 requires fixture users with scripted learning histories covering a strong category, a low-skill weak category, a never-played category and a stale category. Those rows live in `game_sessions`, `answers`, `learning_events`, `skill_profiles` and `skill_updates`, whose write paths are built in Phases 1 to 3.
- Decision: Seed them now as deterministic data. No Phase 1 or Phase 3 _code_ is written — the seed inserts rows directly, computing the §11.3 Elo chain so `skill_profiles.rating` equals the last `skill_updates.rating_after`. Sessions are marked `post_processed_at`, and `skill_updates` rows exist, so Phase 3's `coach/process-session` job will correctly skip them rather than double-applying the events. Confirmed with the product owner before implementation.
- Consequences: §13.6 is satisfied in full and Phase 3 has ready-made fixtures for weak-category detection, recommendations and multipliers. The seed encodes the Elo formula a second time, which the Phase 3 unit tests must be checked against when `coach/` lands.

## ADR-040: `/next` on a fully-resolved session returns `INVALID_SESSION_STATE`

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §16.2 defines `/next` as "serve next question", but names no outcome for the case where every question already has an answer. The client should never reach it — `/answer` returns `sessionFinished: true`, which points at `/complete` — but a reload or a stale tab can.
- Decision: `409 INVALID_SESSION_STATE` with `details.sessionFinished = true`. The client treats that flag as "go to results" rather than as an error.
- Consequences: No new error code, and the distinguishing information is in `details` where §16.1 already puts `ACTIVE_SESSION_EXISTS`'s session id. `useQuizSession` branches on the flag and shows the finish button.

## ADR-041: `/abandon` works only from `ACTIVE`; `CREATED` sessions are cancelled

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §8.1 says the client offers "Resume or Abandon" for an open session, but §15.1 has no `CREATED → ABANDONED` edge — a session with nothing served goes to `CANCELLED`. Taken literally the two read as a contradiction.
- Decision: Keep the state machine literal. `/abandon` accepts only `ACTIVE`; `/cancel` accepts only `CREATED`. So the client can pick correctly, `409 ACTIVE_SESSION_EXISTS` carries `details.status` alongside `details.sessionId`, and `ActiveSessionPrompt` labels the button "Abandon" or "Cancel" from it.
- Consequences: The §15.1 table stays the single source of truth for legality and needs no new edge. The cost is one extra field in an error envelope.

## ADR-042: Every terminal transition sends `session/terminal`, including `CANCELLED`

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §18.3 says the event is sent after completion "and … after `ABANDONED`/`EXPIRED`", omitting `CANCELLED`. But `sessions/reconcile` selects terminal sessions with `post_processed_at IS NULL`, so a cancelled session that never gets an event would match that query forever and be re-sent every hour for the life of the database.
- Decision: Send `session/terminal` on every terminal transition — `COMPLETED`, `ABANDONED`, `EXPIRED` and `CANCELLED`.
- Consequences: The reconcile query has a terminating condition for every row it can select. A cancelled session has no learning events, so its consumer does nothing beyond stamping the column.

## ADR-043: Phase 1 ships `sessions/mark-post-processed`

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §18.3 makes `coach/process-session` the consumer that sets `post_processed_at`, but that job is Phase 3. Until it exists nothing clears the flag, so the `sessions/reconcile` job §24 Phase 1 asks for would re-send for every terminal session, every hour, indefinitely. Building the reconcile job without a consumer would mean shipping a known defect.
- Decision: Add a minimal `sessions/mark-post-processed` consumer of `session/terminal` that only stamps the column. It performs none of the Coach's work.
- Consequences: The reconcile loop terminates from Phase 1. **Phase 3 must not treat `post_processed_at` as its idempotency guard** — §18.1 already specifies `skill_updates.learning_event_id UNIQUE` for that, so `coach/process-session` can safely re-process Phase 1 and Phase 2 sessions to backfill Elo updates. Phase 3 will need to re-send `session/terminal` for sessions whose learning events lack `skill_updates` rows.

## ADR-044: Rate limits are deferred to launch hardening

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §19.2 specifies limits for session creation (30/hour) and answer submission (5/second) using Upstash Ratelimit. Upstash is not installed (ADR-035), Phase 1's scope line does not mention limits, and no phase's acceptance criteria require them before Phase 11's "launch hardening".
- Decision: Not implemented in Phase 1. They arrive with the phase that installs Upstash Redis, together with the §19.2 fail-open/fail-closed behaviour.
- Consequences: Phase 1 has no protection against a client hammering `/answer`. The database constraints still prevent duplicate answers and duplicate awards, so the exposure is load, not correctness. This must be closed before public launch (§28).

## ADR-045: `response` is `{optionId}` for MCQ and `{value}` for NUMERIC

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §16.2 gives `/answer` a `response` field but does not define its shape, and §8.1 describes numeric normalisation without saying what arrives on the wire.
- Decision: MCQ sends `{ optionId: string }`; NUMERIC sends `{ value: string }` carrying the learner's raw, un-normalised text. A response whose shape does not fit the question's type is `400 INVALID_INPUT` — a client bug. Text that does not parse as a number grades **0**: that is a wrong answer, not a malformed request.
- Consequences: Normalisation (trim, strip thousands separators, parse as decimal) happens server-side where §8.1 puts it, so the client cannot influence grading by pre-formatting. Sending the raw string also keeps the learner's literal input in `answers.response_json` for the review screen.

## ADR-046: Insufficient content in a category is a `404 NOT_FOUND`

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §11.6 requires ten questions per session and §16.1 has no code for "this category cannot currently be played". The seed guarantees 15 per launch category and §13.6 requires ≥12, so this is an operational fault rather than a user error.
- Decision: `404 NOT_FOUND` with `details.reason = 'INSUFFICIENT_QUESTIONS'` and the available count, logged at error level as `session.insufficient_questions`.
- Consequences: A content gap fails loudly in the logs and cleanly for the learner, rather than silently serving a short quiz — which would corrupt the §10 scoring assumptions and the §6 qualifying-session definition.

## ADR-047: Question positions are 0-based

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: `session_questions.position` is a `smallint` with no stated base, and `/answer` takes a `position`.
- Decision: 0-based throughout the database and the API, matching array indexing and the Phase 0 dev seed. The UI displays `position + 1` ("Question 1 of 10").
- Consequences: One convention everywhere below the presentation layer. The only place the two differ is a single `+ 1` in `QuizProgress` and the review list.

## ADR-048: History is completed sessions only, paged by session id

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: §16.2 describes `GET /api/me/history?cursor=` as "completed sessions with points" without defining the cursor.
- Decision: `status = 'COMPLETED'` only — abandoned and expired sessions earn no points and have no results page. Twenty per page, keyset-paged on the session id descending.
- Consequences: Because ids are UUID v7 (§14.1, ADR-028) they sort by creation time, so ordering by id is ordering by recency and the Phase 0 `game_sessions_owner_history_idx` covers the query. No new column, no offset pagination, and no skipped or repeated row when a session is completed mid-page.

## ADR-049: Session orchestration lives in `apps/web/lib/sessions/`

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: The §18.2 completion transaction is neither pure domain logic nor plain data access, so §21.2 does not obviously assign it a home.
- Decision: `apps/web/lib/sessions/`. §21.2 gives `apps/web` "route handlers + Inngest functions", `packages/core` the pure logic and `packages/db` the repositories, and this orchestration is what route handlers and jobs call.
- Consequences: `computePoints`, grading and selection stay pure and unit-tested in `packages/core`; all I/O stays in `packages/db`. Multiplayer writes a different transaction (§17.5), so this is not an architectural dead end for Phase 8.

## ADR-050: The `route()` wrapper validates dynamic params

- Status: Accepted
- Date: 2026-09-29
- Phase: 1
- Context: Phase 0's wrapper took only a `Request`, but Next.js passes dynamic segments in a second argument whose `params` is a promise, and every `/api/sessions/:id/*` route needs it.
- Decision: `route()` accepts Next's second argument and takes an optional `params` Zod schema, exposing the parsed result on the handler context alongside the body and the query string. A segment that fails validation returns `404 NOT_FOUND`, not `400`: a non-UUID session id can only ever address a session that does not exist.
- Consequences: Handlers never touch `context.params` directly or await it themselves. The three Phase 0 routes are unaffected — the new argument is optional.

## ADR-051: `coach/process-session` replaces the Phase 1 stub, with a backfill

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: ADR-043 shipped `sessions/mark-post-processed` as a stub that stamped `post_processed_at` and applied no Elo. Phase 3's real consumer is `coach/process-session`. Sessions played in between have learning events and no `skill_updates` rows, and because the stub already stamped them, nothing would ever revisit them.
- Decision: Delete the stub and replace it with `coach/process-session` on the same `session/terminal` trigger. Add `pnpm admin:backfill-skills`, which finds sessions whose learning events have no `skill_updates` row and re-sends `session/terminal` for each.
- Consequences: One consumer, not two, so there is no ordering question between them. The backfill is safe to run repeatedly because `skill_updates.learning_event_id` is UNIQUE (§18.1) — an event that was already applied is skipped rather than double-counted. Pre-Phase-3 sessions contribute to ratings only once someone runs the command; it is not automatic, because re-rating historical play is a decision, not a migration.

## ADR-052: `pnpm admin:process-skills` drains the Coach in-process

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §23.4 covers a lost `session/terminal` with `sessions/reconcile`, which re-sends the event. That is the right answer when Inngest is delivering but an individual send was lost. It is no answer at all when nothing is _consuming_ — a local environment with no Inngest dev server, or an outage — because re-sending into an unread queue changes nothing, and ratings silently stop moving while the app looks healthy.
- Decision: Add `runDrainPendingSessions()` and expose it as `pnpm admin:process-skills`. It runs the same `runProcessSession` the job runs, over the same "events with no skill update" query, sequentially.
- Consequences: There is a recovery path that does not depend on Inngest. It relies on the same idempotency guards as the job, so it is safe to run repeatedly and safe to run while Inngest is healthy. It also lets the Playwright suite exercise the real Coach without booting an Inngest dev server: `e2e/helpers/coach.ts` calls it in the runtime's place, so the E2E assertions read output produced by production code rather than by a mock. Draining is sequential rather than parallel, because the per-user concurrency key is what makes the Elo chain deterministic and a manual drain must not be the thing that breaks it.

## ADR-053: A strength must sit above the starting rating

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.4 defines strengths as "top 2 by `proficiency × confidence` with `confidence ≥ 0.3`". The confidence gate stops a lucky first session being called a strength, but nothing stops a _confidently bad_ category being called one. The `fx_weak` fixture found this: it has played only logic, at 30% accuracy, reaching 39 proficiency with 0.63 confidence — clearing the gate as the only eligible category, and being shown to the learner as "Strongest: logic". §20 screen 7 puts that string in front of the user.
- Decision: Add `proficiency > 50` as a second gate. 50 is the proficiency of the 1000 starting rating (§11.3, §11.4), so this asks only that a strength be something the learner has actually demonstrated rather than merely been measured at.
- Consequences: A learner with no category above the starting rating is shown an empty strengths list and the "play more and your strengths will show up" copy, which is true, instead of a misleading label. Weakness scoring, recommendations and every multiplier are untouched — this changes one read-time display rule. The threshold is a named constant, `STRENGTH_MIN_PROFICIENCY`, so a later tuning pass has one place to look.

## ADR-054: `session/terminal` carries `userId` so Inngest can route on it

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §18.3 requires `coach/process-session` to run with "concurrency key = user_id". Inngest evaluates a concurrency key against the event payload, and the Phase 1 event carried only `sessionId`.
- Decision: Widen the payload to `{ sessionId, userId }` and set `concurrency: { key: 'event.data.userId', limit: 1 }`.
- Consequences: One learner's sessions are processed serially, so two sessions finishing together cannot both read the same `rating_before` and have one overwrite the other. Serialising per user rather than globally keeps throughput. The event id stays derived from the session id alone, so deduplication is unaffected and a reconcile re-send still collapses onto the original delivery.

## ADR-055: Exploration draws its randomness from one hash

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.5 step 2 explores with probability 0.1 "seeded by `hash(user_id, local_date)`", and when it fires it must also choose _which_ alternative to take. The spec names one seed for what are two decisions.
- Decision: Take a single SHA-256 of `learnarena:recommendation:{userId}:{localDate}` and read both values from it: the first 8 hex digits divided by 2^32 give `r ∈ [0,1)`, the next 8 taken modulo `n` give the uniform pick. The full digest is stored in `reason_json.exploration.seed`.
- Consequences: One hash, one stored seed, and the whole choice is reproducible from `(user_id, local_date)` alone — which is what makes lazy generation safe to race and `reason_json` genuinely explanatory. Deriving the pick from a second hash would have been equally valid but would have meant storing two seeds to stay auditable.

## ADR-056: Exploration picks only among other weak categories

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.5 step 2 says to explore "if more than one category is over the threshold", without saying what the alternative is drawn from.
- Decision: Draw uniformly from the weak categories other than the top-ranked one. When there is no such alternative, exploration cannot fire at all, whatever `r` is.
- Consequences: Exploration varies the learner's focus without ever recommending a category they are already strong at, which would waste the ×1.5. The condition in the spec and the pool being drawn from are the same set, so the rule is self-consistent.

## ADR-057: Prior qualifying sessions are the same category, completed, qualifying

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.7 needs "at least 3 prior qualifying sessions" and a baseline over "the most recent 5", without defining the filter precisely.
- Decision: `status = 'COMPLETED'` and `is_qualifying` and the same `category_id`, ordered by `ended_at` descending, taking 5. Abandoned and expired sessions are excluded from the baseline and can never trigger the bonus. The threshold comparison uses `≥`, so exactly +0.10 grants it.
- Consequences: The improvement bonus measures improvement at one subject, which is what §11.7 is for; mixing categories would let a strong subject mask a weak one. A partial index, `game_sessions_improvement_idx`, covers exactly this query.

## ADR-058: The recommendation is claimed through `AVAILABLE → IN_PROGRESS → COMPLETED`

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.5 requires the ×1.5 to be granted at most once and abandoning not to consume it. The obvious implementation — a guarded `UPDATE … WHERE status IN ('AVAILABLE','IN_PROGRESS')` straight to `COMPLETED` — is illegal: §15.5 has no `AVAILABLE → COMPLETED` edge, and the transition table rejects it.
- Decision: Walk the two legal edges. Session creation marks the recommendation `IN_PROGRESS`; completion moves `IN_PROGRESS → COMPLETED` and stamps `completed_session_id`. `claimForCompletion` performs the `AVAILABLE → IN_PROGRESS` step first as a no-op-if-already-there, so a session created before the link still claims correctly. Abandoning or expiring releases `IN_PROGRESS → AVAILABLE`.
- Consequences: Four independent layers make double-granting impossible: the session row lock, `SELECT … FOR UPDATE` on the recommendation, the guarded `UPDATE … WHERE status IN (…)`, and `recommendations.completed_session_id UNIQUE`. The state machine stays the single description of legal movement rather than being bypassed at one call site. ADR-012 (one open solo session) makes two simultaneously-completable sessions from one recommendation unreachable through the API, so the concurrency test races `claimForCompletion` at the repository level instead.

## ADR-059: The radar's opacity tracks mean confidence

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §20 screen 7 asks for a radar chart with "one axis per launch category, opacity by confidence". Recharts draws one polygon per series with a single `fillOpacity`; a per-axis opacity needs a custom shape renderer.
- Decision: The polygon's opacity tracks the mean confidence across categories, floored so a new learner still sees the shape of their profile. Each category's own confidence is shown as a percentage in the list beside the chart.
- Consequences: No information is lost — per-category confidence is on screen, just not encoded in the fill. ADR-021 defers exactly this kind of custom rendering to the Google Stitch pass, and a custom shape renderer would be thrown away by it.

## ADR-060: Rating history is read from `skill_updates`

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §20 screen 7 asks for a per-category rating history. Nothing in §14.2 stores a time series.
- Decision: Read it from `skill_updates`, which §11.3 already maintains as the audit trail for every rating change, taking the most recent 30 per category with a window function. Proficiency is derived per point at read time.
- Consequences: The chart is the same data that explains every rating, so it cannot drift from the profile — Invariant 5 gets a user-facing surface rather than a parallel store. No new table, no new write path.

## ADR-061: `GET /api/me/skills` never generates a recommendation

- Status: Accepted
- Date: 2026-09-30
- Phase: 3
- Context: §11.5 generates the daily recommendation lazily on the first read of the local date. `/api/me/skills` reports `recommendedCategorySlug` and each category's tier, so it is also a read of that state.
- Decision: Only `GET /api/me/recommendation` generates. `/api/me/skills` reports a recommendation that already exists and otherwise reports none, staying a pure read.
- Consequences: A GET that a learner can trigger by opening the Skills page has no side effects. The cost is an ordering constraint on the client: Home fetches the recommendation first and the skills second, because racing them would leave the picker showing ×1.25 on every category on the first visit of a day. That sequencing is commented at the call site.

## ADR-062: Streak continuity and timezone edge cases

- Status: Accepted
- Date: 2026-09-30
- Phase: 2
- Context: The supplied Phase 2 plan identifies ambiguity in protected streak length, westward timezone changes, and crossing seven days via freezes.
- Decision: Retain the existing DST-safe Intl calendar helpers. A protected streak retains the run ending at its last stored date; a broken streak displays zero. Dates earlier than the last credit are no-ops. Crossing a multiple of seven grants at most one freeze per completion date, after consumption, capped at two held. Non-qualifying sessions use the unchanged read-time streak multiplier. Milestones are recorded in session results. Settings initially covers display name and timezone.
- Consequences: Historical dates are immutable. A user row lock serializes credit, profile changes and rebuilds, including the first credit when no streak row exists. Completion reads the timezone under this lock. Rebuild and credit share the same pure summary function.

## ADR-063: Explicit test clock for browser journeys

- Status: Accepted
- Date: 2026-09-30
- Phase: 2
- Context: Browser tests cannot reach the in-process injectable session clock.
- Decision: x-test-clock is honored only when APP_ENV is local/test and E2E_CLOCK_OVERRIDE=1. Playwright enables it for its server. Production and preview always ignore it. Invalid values are ignored.
- Consequences: Browser tests advance local dates without waiting or a global mutable server clock. The environment guard has an integration test.

## ADR-064: Shared visual system without Stitch access

- Status: Accepted
- Date: 2026-09-30
- Phase: Design pass
- Context: The user requested implementation of all prompts. Tool discovery found no Google Stitch capability. ADR-022 is already assigned to onboarding semantics.
- Decision: Establish the shared visual system locally: warm neutral backgrounds, indigo actions, generous rounded cards, consistent navigation, dark theme, visible keyboard focus and reduced-motion support. Keep existing presentation contracts and test selectors. Use this ADR number instead of overwriting ADR-022.
- Consequences: Subsequent screens use these tokens and primitives. This is an original local design, not an imported Stitch design. No external design service is required to run the app.

## ADR-065: Daily challenge curation and leaderboard fallback

- Status: Accepted
- Date: 2026-09-30
- Phase: 4
- Context: The specification defines a curated daily set without a publication interface before Phase 6. Redis may be unconfigured locally.
- Decision: Store a fixed ordered set of ten published question versions per date. The initial publisher uses a single category; a local/test fixture command publishes math. A completion grants the fixed bonus independently of session multipliers, once per user/challenge date. Replays receive ordinary session points. Redis uses absolute scores and per-user serialization; a missing, stale or unavailable projection falls back to canonical SQL. Equal points share competition ranks, with username tie order.
- Consequences: No automatic publication of generated content. Admin publication can reuse the repository. The response identifies database fallback. Upstash is also installed in the database workspace to keep Drizzle's optional peer dependency instance identical across workspaces.

## ADR-066: Versioned activity content and normalized assessments

- Status: Accepted
- Date: 2026-09-30
- Phase: 5
- Context: Scenarios and generators need immutable versions; quiz answers require a question-version FK that generated items and scenario nodes do not have.
- Decision: Use activity_versions for both scenario graphs and generator configurations, distinguished by an enum. activity_sessions references the version and seed. activity_assessments records served items, responses and outcomes with unique source/position guards. All modes write through learning/recordEvent and use the existing completion transaction, points calculation and ledger. Scenarios disable combo and add 50 for a best ending. Memory uses five sequence-recall rounds by the default versioned template. Sprint items are generated on demand until the server's 60-second deadline.
- Consequences: No fake question versions or parallel reward path. One content versioning implementation serves both activity kinds. Scenario graphs must be acyclic, with unique nodes and reachable endings. Three scenario fixtures are explicitly DEV_SEED; seed reviewer metadata is not evidence of production human review. Published activity content is protected by a trigger. Memory is an ACTIVE category included in Coach signals; its playable format is memory_match.

## ADR-067: Audited publishing roles and immutable reviewed questions

- Status: Accepted
- Date: 2026-09-30
- Phase: 6
- Context: The content studio needs server-side authorization and a safe edit path for reviewed material.
- Decision: AUTHOR or ADMIN can create drafts; REVIEWER approves another author's version; ADMIN publishes and archives. A returned draft that has previously entered review is forked before assessment edits. Publishing locks the question and archives its old live version atomically. Every state change writes content audit; every administrative request writes admin audit. Repeated save/transition/fork operations converge on the existing version.
- Consequences: AI_GENERATED versions follow the same mandatory independent human review. A database trigger also prevents assessment edits to reviewed questions, including direct SQL writes. The studio shows versions, comparison and audit history.

## ADR-068 — Social discovery and portable rate limits

**Status:** Accepted for implementation; public safety policy remains a launch decision.

Use both username requests and single-use, seven-day invite links, as the plan's default. Blocking removes friendship and hides both users on boards. Pair locks serialize crossed requests and block operations; a redeemed-by guard makes invite retries safe. Requests use an exact Redis sliding-window Lua script, compatible with Upstash and the local Redis HTTP bridge. Redis outage fails closed for social/lobby actions and open for solo play.

## ADR-069 — Multiplayer ownership and reconnect credentials

**Status:** Accepted.

One separate Socket.IO instance owns transient rounds. Shared core rules resolve co-op votes and deathmatch damage; one database transaction stores answers, events, match results, streak credit and ledger awards. Results are visible only after commit. Process restart cancels interrupted matches. The signed reconnect credential is bounded to the match's lifetime; the server additionally requires a recorded disconnection no more than 30 seconds ago. This avoids a credential expiring while a player is still connected. Fresh handshake credentials cannot bypass that window. Solo mutation endpoints reject multiplayer sessions. Skills processing serializes and commits updates per user, including multiplayer participants.

## ADR-070 — Narration cannot make numeric or reward claims

**Status:** Accepted.

Anthropic is invoked only by background jobs with an explicitly configured model. Output is structured as two or three sentences and one tip, capped at 400 rendered characters. Generated numerical, rating and reward claims are rejected; numeric facts remain rendered directly from canonical data. Missing configuration, provider errors and validation failure use deterministic templates. Narration and achievements never decide scoring. Event windows are globally non-overlapping, enforced by a Postgres exclusion constraint, and their metadata is retained in scoring breakdowns.
