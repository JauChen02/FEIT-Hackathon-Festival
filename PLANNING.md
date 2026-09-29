# LearnArena: Implementation Specification

> A gamified learning platform: solo quizzes, interactive scenarios, co-op quizzes and team "knowledge deathmatch", driven by streaks, multiplicative points, social bonuses, weekly leaderboards, and a deterministic Coach that finds each learner's weak areas and rewards them for working on those areas.

**How to use this document.** This is the single source of truth for an AI coding agent. Build strictly phase by phase (§24). Every phase has acceptance criteria. Rules marked **MUST** are non-negotiable; if something is ambiguous, follow §29 (Agent Operating Instructions) and record the decision in `DECISIONS.md`.

**Conventions.** `MVP`, `Alpha`, `Social Beta`, `Multiplayer Beta`, `V1` tags mark when something is built. Anything tagged later than the current phase MUST NOT be built yet, except for a minimal interface that avoids a known architectural dead end (e.g. `session_players` exists from MVP even though solo sessions only ever have one player).

**Provisional decisions.** Items marked **[PROVISIONAL]** are defaults chosen so building can start. They are recorded in `DECISIONS.md` and the product owner must confirm them before the stage listed in §28.

---

## Table of Contents
1. Product Definition
2. Target User
3. MVP Scope & Release Stages
4. Non-goals
5. System Invariants
6. Glossary
7. Core Learning Loop
8. Game Modes
9. Normalized Learning Event Contract
10. Scoring
11. Coach
12. Retention & Social
13. Content Model & Publishing
14. Data Model
15. State Machines
16. API Surface
17. Realtime Protocol
18. Idempotency & Transactions
19. Security, Abuse & Privacy
20. UX Screens
21. Technical Architecture
22. Testing Strategy
23. Observability & Failure Modes
24. Build Phases (with acceptance criteria)
25. Global Definition of Done
26. Deferred Features
27. Success Metrics & Analytics
28. Open Product Decisions
29. Agent Operating Instructions
- Appendix A: Planning-Doc Quality Gate
- Appendix B: DECISIONS.md Format

---

## 1. Product Definition

**One-liner:** Duolingo-style retention + Kahoot-style multiplayer + a personal Coach that makes learners well-rounded.

**Primary goals (in priority order)**
1. **Learning is the core outcome.** Every game mode MUST produce normalized, measurable learning data (§9).
2. **Players return daily** (streaks, daily recommendation, weekly leaderboards).
3. **Players learn with friends** (co-op, team matches, friend multipliers). *Social Beta onward.*
4. **Players are nudged toward weaknesses** and rewarded more for tackling them.

**Design principle: sticky, not harmful.** Points reward learning signals (accuracy, improvement, working on weaknesses), not raw time spent. See §12.5.

---

## 2. Target User

| Decision | Value |
|---|---|
| Primary target learner | **[PROVISIONAL]** Self-directed learners who want short, game-like practice sessions |
| Age range | **[PROVISIONAL]** 16+ (users confirm age at onboarding). Under-16 support is out of scope until child-privacy requirements are resolved (§28) |
| Primary context | **[PROVISIONAL]** Adult / older-teen general skill practice (math, logic, science fundamentals) |
| Initial geography | **[PROVISIONAL]** English-speaking, global |
| Expected device | Mobile-first responsive web (PWA-capable); desktop supported |

The target audience directly affects content tone, UI density, privacy, moderation, notifications, account flows, social features and parent/guardian requirements. **Production content work MUST NOT begin until the audience is confirmed.** If the confirmed audience includes users under 16, the privacy and safety requirements in §19 become **release blockers** for every stage from Social Beta onward, and parental-consent flows must be designed before any social feature ships.

### 2.1 Subject Scope

| | Categories |
|---|---|
| Long-term taxonomy | math, logic, science, memory, language, history (extensible) |
| **Launch categories (MVP)** | **[PROVISIONAL]** `math`, `logic`, `science` |
| Added in Alpha | `memory` (requires the `memory_match` mini-game; memory is not assessable by multiple-choice quiz) |
| Deferred categories | `language`, `history`, others |

---

## 3. MVP Scope & Release Stages

### 3.1 MVP Definition
The MVP is **complete** when a user can:
1. Sign up and authenticate.
2. Complete basic onboarding (username, display name, timezone, age confirmation).
3. Play a solo quiz in a launch category.
4. Submit answers that are graded server-side.
5. Earn points (recorded in the canonical point ledger).
6. Maintain a daily streak (including streak freezes).
7. Build a category-level skill profile.
8. Receive a deterministic Coach recommendation with a bonus multiplier.
9. Review missed questions with explanations.
10. Return later and see persisted progress (points, streak, skills, history).

The following are **post-MVP** (except for minimal interfaces required for compatibility): multiplayer, co-op, team deathmatch, leaderboards, leagues, friendships, friendship levels, activity feeds, LLM-generated coaching, achievements (beyond a minimal test implementation), push notifications, mini-games, dialogue scenarios, daily challenge, AI-generated questions, admin publishing UI, teacher/classroom systems.

### 3.2 Release Stages

| Stage | Contents | Phases |
|---|---|---|
| **MVP** | Auth, onboarding, solo quiz, server grading, points ledger, streaks & freezes, deterministic Coach, recommendations, results review, skills page | 0 to 3 |
| **Alpha** | Weekly global leaderboard (Redis), daily challenge, `memory_match` + `speed_math` mini-games, dialogue scenarios, admin publishing UI | 4 to 6 |
| **Social Beta** | Friends (request/accept/decline/block), friends leaderboard, invite links | 7 |
| **Multiplayer Beta** | Realtime server, co-op consensus quiz, friend multiplier, team deathmatch | 8 to 9 |
| **V1** | LLM coaching, achievements, web push, simple activity feed, admin event multipliers, privacy/export/deletion flows, launch hardening | 10 to 11 |

**The agent MUST implement only the current phase.**

---

## 4. Non-goals
- User-generated course authoring (content is authored and reviewed internally; §13).
- Native mobile apps (responsive web / PWA only).
- Payments, subscriptions, cosmetics, monetization.
- Organization tenancy. **MVP is consumer-first.** Users exist independently; the schema MUST NOT hard-code assumptions that prevent a future `organizations` / `classrooms` entity that references users, but no tenancy is implemented.
- Guest play. **Authentication is required before play** (Option A). No anonymous sessions, no guest-to-account migration.
- Everything in §26 (Deferred Features).

---

## 5. System Invariants

These MUST hold at every phase. Any change that would violate one requires an ADR in `DECISIONS.md` and product-owner approval.

1. **Clients never determine** correctness, canonical points, streak state, skill ratings, leaderboard totals or match outcomes. Clients send intents (answers, votes, actions); the server decides.
2. **A game session can generate rewards at most once** per user per reward reason.
3. **Every point change has a canonical `point_ledger` record.** The ledger is append-only; corrections are new `ADJUSTMENT` rows, never updates or deletes.
4. **User-facing point totals are reproducible** from `point_ledger`. Cached totals (`users.total_points_cached`, Redis leaderboards) are rebuildable projections.
5. **Every skill-profile change is explainable** from stored learning events via `skill_updates` rows.
6. **Published assessment content is immutable.** Editing assessment-critical fields creates a new version (§13).
7. **The LLM never determines** points, correctness, proficiency, streaks, leaderboard position, match outcomes, achievement eligibility, or content publication. If an LLM call fails, all deterministic behavior continues.
8. **Multiplayer state is authoritative on the realtime server.**
9. **Every playable game type emits normalized learning events** (§9). The Coach consumes only those events.
10. **Retries never duplicate** answers, points, rewards, streak updates, skill changes, recommendation completions or leaderboard entries (§18).
11. **Historical learning data remains interpretable** after content changes (answers reference immutable content versions).
12. **Important state transitions are auditable** (status changes are timestamped; content and admin changes are written to an audit log).
13. **Server timestamps are canonical.** All timestamps are stored in UTC; client timestamps are advisory diagnostics only.
14. **Postgres is the durable source of truth.** Redis is a cache/projection only; losing Redis never loses canonical progress.

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **Category** | A skill domain, e.g. `math`. Skill ratings are tracked per category. |
| **Sub-topic** | Free-text-but-controlled label within a category, e.g. `fractions`. Stored on content and learning events; **not** a skill dimension in MVP. |
| **Game Type** | A playable format: `quiz_solo`, `quiz_coop`, `team_deathmatch`, `memory_match`, `speed_math`, `dialogue_scenario`. |
| **Game Session** | One instance of a game played by 1+ users. Has a status governed by §15.1. |
| **Question / Question Version** | A question is a stable identity; each version holds the assessable content. Answers reference versions. |
| **Learning Event** | A normalized record of one assessed interaction (§9). |
| **Point Ledger** | Append-only table of every point award; the canonical points source. |
| **Qualifying Session** | A `COMPLETED` session in which the user resolved every question and at least 50% of questions were `ANSWERED` (not `TIMEOUT`). Qualifying sessions grant streak credit and recommendation completion. |
| **Skill Profile** | Per (user, category) canonical Elo `rating` plus exposure counters. Display values are derived. |
| **Weakness** | A category with high `weakness_score` (§11.4): low skill, low exposure and/or staleness. |
| **Recommendation** | The Coach's single daily pick for a user (§11.5). |
| **Local date** | A calendar date in the user's IANA timezone at the moment of the event. |
| **Week key** | ISO-8601 week identifier in UTC, format `YYYY-Www` (e.g. `2026-W40`). |

---

## 7. Core Learning Loop

```
Home ─► See "Focus today" recommendation (bonus shown)
  │
  ▼
Start solo quiz (category, 10 questions, difficulty chosen by Coach target rating)
  │
  ▼
Answer one question at a time ─► server grades, returns feedback + next question
  │
  ▼
Complete ─► single transaction: streak credit, recommendation credit, points ledger
  │
  ▼
Results: points breakdown, missed-question review with explanations
  │
  ▼
Async: skill ratings updated from learning events ─► skill deltas appear
  │
  ▼
Next day: new recommendation targets the updated weakest area
```

---

## 8. Game Modes

All modes MUST emit normalized learning events (§9) and follow the session state machine (§15.1).

### 8.1 Solo Quiz (`quiz_solo`): MVP
- **Shape:** one category per session, 10 questions, 20,000 ms per question.
- **Question types (MVP):** `mcq` (single correct option) and `numeric` (exact match after normalization: trim, strip thousands separators, parse as decimal; the version's `answer_json` may define an absolute `tolerance`). `order` and `match` types are Alpha.
- **Delivery:** questions are served **one at a time**. The server records `served_at` and `deadline_at` when each question is served. Answer keys are never sent before the answer is graded.
- **Question selection:** see §11.6.
- **At most one open solo session per user** (`CREATED` or `ACTIVE`). Starting another returns `409 ACTIVE_SESSION_EXISTS` with the open session id; the client offers *Resume* or *Abandon*.
- **Replay rules:**
  - A session can never be replayed or resumed after it reaches a terminal state.
  - Users may start unlimited new sessions in any launch category.
  - The recommendation bonus is granted once per recommendation (§11.5).
  - The daily challenge (Alpha) grants its bonus once per user per challenge date.
  - Scenarios (Alpha) may be replayed; each playthrough is a new session.

### 8.2 Edge-case Rules (solo)

| Situation | Rule |
|---|---|
| Answer received ≤ `deadline_at + 1000 ms` grace | Accepted. Speed factor uses `time_left = max(0, deadline_at − server_received_at)`. |
| Answer received after grace | Rejected with `409 QUESTION_EXPIRED`; the question is resolved as `TIMEOUT` (correctness 0). |
| Question served but never answered, deadline passed | Resolved as `TIMEOUT` lazily (on next request for that session, or on `/complete`). |
| All 10 questions resolved | Session may be completed via `/complete` (the answer endpoint returns `sessionFinished: true`). |
| User taps *Abandon* | `ACTIVE → ABANDONED`. Submitted answers and their learning events are kept and **do** update skill ratings. No points, no completion bonus, no streak credit, no recommendation credit. |
| No activity for 30 minutes | `ACTIVE → EXPIRED` (or `CREATED → EXPIRED`). Same consequences as abandoned. Served-but-unanswered questions produce **no** learning event. |
| User cancels before the first question is served | `CREATED → CANCELLED`. No effects. |

### 8.3 Dialogue Scenarios (`dialogue_scenario`): Alpha
- Branching conversations stored as versioned JSON graphs (§13).
- Each node: NPC line, 2 to 4 choices. Each choice: `correctness` (0..1), `feedback`, `next_node_id`, and the node has exactly one `category_id` and optional `sub_topic`.
- Each choice made emits one learning event (`source_key = node id`), difficulty rating = scenario version's rating.
- Scoring: each choice is treated as one "question" in §10 with `speed_factor = 1.0` (scenarios are untimed) and no combo. Reaching an ending marked `best_ending: true` adds a 50-point bonus to raw base.
- Free-form LLM NPCs are deferred (§26).

### 8.4 Mini-games: Alpha
- `speed_math`: 60-second arithmetic sprint; each item is a generated problem from a versioned generator template (template id + seed stored so it is reproducible). Each item emits a learning event.
- `memory_match`: sequence/pair recall rounds; each round emits a learning event with correctness = fraction of the round recalled correctly. Category `memory`.
- Rating per item: derived from the template's configured difficulty via the §11.2 mapping.

### 8.5 Daily Challenge: Alpha
- One curated 10-question set per calendar date (`daily_challenges.challenge_date` UNIQUE). A user plays the challenge for **their local date**.
- Played as a `quiz_solo` session with `daily_challenge_id` set. Completion grants normal points plus a fixed `DAILY_CHALLENGE_BONUS` ledger row of 100 points (once per user per challenge date).

### 8.6 Co-op Consensus Quiz (`quiz_coop`): Multiplayer Beta
- 2 to 6 players, shared 10-question set, 20,000 ms per question.
- Each player submits one vote per question. **Team answer** = plurality vote; ties broken by the earliest server-received vote among the tied options. No votes = team timeout.
- Question locks when all players have voted or at the deadline.
- **Individual learning events** use each player's own vote (their own correctness).
- **Points:** per question, team base = `100 × team_correctness × speed_factor(lock time)`; every player receives the same raw base; multipliers (§10) are applied per player. Combo uses the team's consecutive correct answers.
- The *relay/assist* variant is deferred.

### 8.7 Team Deathmatch (`team_deathmatch`): Multiplayer Beta
- Two teams, 2v2 to 5v5. Each team starts with 100 HP. Max 15 rounds, 15,000 ms per round.
- Each round, every player answers the same question independently.
- **Damage** dealt by a correct answer: `round(10 × correctness × speed_factor × (1 + 0.1 × min(player_combo, 5)))` to the opposing team.
- **Wrong answer:** 3 self-damage to own team. **Timeout:** 0.
- Damage is applied simultaneously at round end. Match ends when a team reaches ≤ 0 HP or after round 15. Higher HP wins; equal HP (including both ≤ 0) is a draw.
- **Question pool** is drawn from launch categories, weighted by the combined weakness scores of all players (probability ∝ `0.2 + weakness_score` per category).
- **Points:** each player's raw base = own per-question base (§10) + 50 completion + outcome bonus (win 100, draw 50, loss 0). Weakness multiplier is 1.0 in multiplayer (mixed categories; weakness is addressed through question weighting instead).
- **Post-match review** of every question the player's team missed, with explanations, is mandatory.

---

## 9. Normalized Learning Event Contract

Every game mode MUST write learning events through a single server module (`learning/recordEvent.ts`). The Coach reads **only** `learning_events` and never game-specific tables.

```ts
interface LearningEvent {
  id: string                  // uuid
  userId: string
  sessionId: string
  gameTypeSlug: string        // e.g. "quiz_solo"
  sourceKey: string           // unique within (sessionId, userId): question_version_id, node id, item index
  questionVersionId?: string  // present when the event concerns a question version
  categoryId: string
  subTopic?: string
  difficultyRating: number    // canonical Elo rating of the item at the time it was served
  correctness: number         // normalized 0..1
  timedOut: boolean
  responseTimeMs?: number     // server-measured
  occurredAt: Date            // server time (UTC)
}
```

Rules:
- `UNIQUE(session_id, user_id, source_key)` guarantees one event per assessed item.
- Quiz answers write the learning event **in the same transaction** as the answer row.
- Events are immutable after insert.
- Game-specific detail (HP, votes, damage) lives in game-specific storage and never in the learning event.
- Multiplayer: the realtime server writes all learning events for a match in the match-result transaction (§17.5).

---

## 10. Scoring

All scoring is a **pure function** `computePoints(input): PointsBreakdown` in `scoring/computePoints.ts`, executed server-side only, using **`decimal.js`** for arithmetic. The ledger stores the full breakdown so any award can be reproduced.

### 10.1 Components

| Component | Rule | Range |
|---|---|---|
| `q_base_i` | `100 × correctness_i × speed_factor_i` | 0 to 100 |
| `speed_factor_i` | `0.5 + 0.5 × (time_left_ms / time_limit_ms)`, `time_left_ms` clamped to `[0, time_limit_ms]`, server-measured. Untimed items: 1.0. Timeouts: correctness 0 so the value is irrelevant. | 0.5 to 1.0 |
| `combo_i` | Number of consecutive answers with `correctness = 1` **immediately preceding** question *i* in this session, capped at 10. Resets on any answer with correctness < 1 or timeout. | 0 to 10 |
| `combo_mult_i` | `1 + 0.05 × combo_i` | 1.00 to 1.50 |
| `completion_bonus` | 50 on `COMPLETED` (plus mode bonuses: scenario best ending +50, match outcome win +100 / draw +50) | |
| `streak_mult` | `1 + 0.02 × min(streak_len, 30)` where `streak_len` is the user's current streak **after** this session's streak credit has been applied (§12.1) | 1.00 to 1.60 |
| `friend_mult` | `1 + 0.10 × eligible_friends_in_session` (max 3 counted, §12.3). Always 1.0 in solo. | 1.00 to 1.30 |
| `weakness_mult` | `tier_mult + improvement_bonus`; `tier_mult` is 1.00 (`NONE`), 1.25 (`WEAK`) or 1.50 (`RECOMMENDED`, §11.5); `improvement_bonus` is 0 or 0.25 (§11.7). Always 1.0 in multiplayer. | 1.00 to 1.75 |
| `event_mult` | Admin-set event multiplier (V1). Fixed 1.0 before V1. | 1.0 to 2.0 |
| `TOTAL_MULT_CAP` | 4.0 | |

### 10.2 Canonical Order of Operations
1. Compute each `q_base_i` (unrounded).
2. `q_combo_i = q_base_i × combo_mult_i` (unrounded).
3. `raw_base = Σ q_base_i + completion_bonus`.
4. `combo_adjusted = Σ q_combo_i + completion_bonus` (bonuses are not combo-multiplied).
5. `session_mult = streak_mult × friend_mult × weakness_mult × event_mult`.
6. `uncapped = combo_adjusted × session_mult`.
7. `cap = raw_base × TOTAL_MULT_CAP`.
8. `final_points = round_half_up(min(uncapped, cap))` → integer. **Rounding happens exactly once, here.**

**Cap semantics:** the cap bounds final points to 4× the **raw base before combo**. `cap_applied = uncapped > cap` is stored in the ledger.

### 10.3 Worked Example (MUST be a unit test)
10 questions, all correct, each answered with 10,000 of 20,000 ms remaining → `speed_factor = 0.75`, `q_base = 75` each. Combos 0..9 → combo mults 1.00..1.45.
- `Σ q_base = 750`, `raw_base = 800`
- `Σ q_combo = 75 × (10 + 0.05 × 45) = 918.75`, `combo_adjusted = 968.75`
- streak 5 days → 1.10; `RECOMMENDED`, no improvement → 1.50; friend 1.0; event 1.0 → `session_mult = 1.65`
- `uncapped = 1598.4375`, `cap = 3200`, **`final_points = 1598`**

### 10.4 Rules
- Points are awarded **only** on a transition to `COMPLETED` (abandoned/expired sessions earn 0).
- Each award writes exactly one `point_ledger` row with reason `SESSION_COMPLETION` (§14, §18).
- The breakdown JSON is shown to the user ("Base 800 · Combo +168.75 · Streak ×1.10 · Focus ×1.50 = 1,598"); it teaches which behaviors are rewarded.

---

## 11. Coach

The Coach has two layers:
1. **Deterministic analytics** (`coach/` module; pure functions + a job runner). Decides ratings, weaknesses, recommendations and bonus tiers. MVP.
2. **LLM narration** (V1). Turns structured Coach output into short messages. Never authoritative (Invariant 7).

### 11.1 Inputs
Only `learning_events` (§9). Scope in MVP: **category level only.** Sub-topic is stored on events and used for "missed topics" summaries and analytics, but the Coach MUST NOT claim or display sub-topic proficiency until a sub-topic model exists (§26).

### 11.2 Difficulty and Rating
- `difficulty` (1 to 5) is **editorial metadata** set by authors.
- `rating` is the **Coach's canonical difficulty estimate**, initialized deterministically from difficulty:

| difficulty | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| initial rating | 800 | 900 | 1000 | 1100 | 1200 |

- **In MVP, question ratings are fixed after publishing** (they live on the immutable question version). Automatic calibration is deferred (§26).

### 11.3 User Rating Updates (Elo)
Per (user, category), starting rating 1000.
```
expected   = 1 / (1 + 10^((item_rating − user_rating) / 400))
K          = 32 if lifetime_event_count < 50 else 16      # count before this event
new_rating = user_rating + K × (correctness − expected)
```
- Events are applied **in `occurred_at` order** (ties by event id), one at a time.
- Each application writes a `skill_updates` row (`learning_event_id` UNIQUE) storing `rating_before`, `rating_after`, `expected`, `k_factor`. This row is the audit trail and the idempotency guard.
- Timeouts are applied with correctness 0.
- Updates run in the post-commit `coach/process-session` job (§18.3), triggered when a session reaches any terminal state with learning events.

### 11.4 Derived Values (computed at read time, never stored as canonical)
```
proficiency     = clamp((rating − 600) / 8, 0, 100)            # display 0..100
exposure_count  = learning events in category, last 60 days
confidence      = 1 − exp(−exposure_count / 30)                 # 0..1
recency_days    = days since last event in category (∞ if never)
staleness       = min(recency_days / 14, 1)

skill_gap       = 1 − proficiency / 100
exposure_gap    = 1 − confidence

weakness_score  = 0.50 × skill_gap × confidence
                + 0.35 × exposure_gap
                + 0.15 × staleness                               # 0..1
```
- A never-played category scores 0.50 (weak due to lack of games), which is intended.
- **Weak categories:** launch categories with `weakness_score > 0.40`, top 3 by score.
- **Strengths:** top 2 categories by `proficiency × confidence` with `confidence ≥ 0.3`.
- Ties are broken by category `slug` ascending.

### 11.5 Recommendations
One recommendation per user per local date (`UNIQUE(user_id, local_date)`), generated **lazily** on the first `GET /api/me/recommendation` of that local date (no cron). Generation is deterministic:
1. Rank launch categories by `weakness_score` (ties by slug).
2. **Exploration:** let `r = hash(user_id, local_date)` mapped to [0,1). If `r < 0.10` and more than one category has `weakness_score > 0.40`, pick uniformly (seeded by the same hash) among weak categories other than the top one. Otherwise pick the top one.
3. **Game type:** among live game types linked to the category (`game_type_categories`), pick the one the user completed most in the last 30 days; tie or no history → `quiz_solo`. (MVP: always `quiz_solo`.)
4. **Target rating:** `target_rating = user_rating − 147` (see §11.6).
5. Store `reason_json` with the inputs snapshot (scores, ratings, seed) so the choice is explainable.

**Lifecycle** (§15.5): the recommendation targets a **category + game type**, is valid only for its local date, and grants `tier_mult = 1.50` on the **first qualifying completion** of a session started from it. Abandoning does not consume it. After completion it stays visible (marked done) but can never grant the bonus again; later sessions in that category receive `WEAK` or `NONE` tier.

### 11.6 Question Selection (all solo quiz sessions)
Pedagogical target: **~70% expected success** (desirable difficulty; acceptable band 65% to 75%).

Under the Elo formula, expected success `p` requires `item_rating = user_rating − 400 × log10(p / (1 − p))`:
- 75% → `user_rating − 191`
- **70% → `user_rating − 147`** (canonical target)
- 65% → `user_rating − 108`

Selection algorithm (deterministic given session id):
1. `target = user_rating(category) − 147`.
2. Candidates: `LIVE` question versions in the category.
3. Exclude versions the user answered in the last 7 days, unless fewer than 10 candidates would remain.
4. Sort by `|rating − target|` ascending; break ties with a PRNG seeded by `session_id`.
5. Take the first 10; present them sorted by rating ascending (warm-up effect).
6. Store the chosen versions and positions in `session_questions` at session creation.

### 11.7 Improvement Bonus
- Applies to solo single-category sessions only.
- `session_accuracy = mean(correctness)` over all 10 questions (timeouts = 0).
- Requires **at least 3 prior qualifying sessions** in the same category; otherwise disabled.
- `baseline = mean(session_accuracy)` of the most recent **5** prior qualifying sessions in the category (or all, if 3 to 4).
- Bonus `+0.25` if `session_accuracy ≥ baseline + 0.10`. No difficulty normalization in MVP (recorded in `DECISIONS.md`); tiny improvements (< 10 points) do not count.
- Abandoned/expired sessions are never part of the baseline and never qualify.

### 11.8 Bonus Tier Snapshot
At session **creation**, the server computes and stores `weakness_tier` on the session:
- `RECOMMENDED` if created from today's recommendation that is not yet `COMPLETED`.
- `WEAK` if the category is currently a weak category.
- `NONE` otherwise.

At **completion**, `RECOMMENDED` is honored only if the recommendation is still eligible (not `COMPLETED`, not `EXPIRED`, and the session is qualifying); otherwise it falls back to `WEAK` if the snapshot's weakness computation said weak, else `NONE`. The snapshot means later skill changes cannot retroactively alter a session's tier.

### 11.9 LLM Narration Layer: V1
- **Triggers:** after a completed session (short message) and weekly (summary). Both are async jobs; gameplay never waits on them.
- **Input:** structured Coach output only, no PII beyond `display_name`:
```json
{
  "display_name": "Alex",
  "strengths": [{"category": "math", "proficiency": 82}],
  "weaknesses": [{"category": "logic", "proficiency": 41, "games_played": 3}],
  "last_session": {"game_type": "quiz_solo", "accuracy": 0.9, "missed_sub_topics": ["fractions"]},
  "recommendation": {"category": "logic", "game_type": "quiz_solo", "bonus": "1.5x"}
}
```
- **Output:** 2 to 3 encouraging sentences + 1 concrete tip, ≤ 400 characters, validated; stored in `coach_messages` with the input snapshot.
- **May:** write coaching messages, summarize structured progress, explain missed concepts **using the approved explanation text as source**, and (later) draft content for human review.
- **Must not:** update ratings, choose scores, alter streaks, grant points or achievements, decide leaderboard placement, adjudicate multiplayer, publish content, or modify canonical answers.
- **Failure:** fall back to templated messages keyed by `(strength, weakness, accuracy band)`. Templates ship in MVP so the UI never depends on the LLM.

---

## 12. Retention & Social

### 12.1 Daily Streaks: MVP
**Timezone semantics**
- `users.timezone` stores an IANA identifier (e.g. `America/New_York`), auto-detected from the browser at onboarding and confirmed by the user.
- A qualifying session's `local_date` is computed **at completion time** from the user's timezone at that moment (using `@date-fns/tz`, which handles DST) and stored on the session.
- Streaks use local calendar dates, not rolling 24-hour windows.
- **Timezone changes** apply only to future qualification; historical `streak_days` rows are immutable. Changes are limited to one per 24 hours (`409 TIMEZONE_CHANGE_COOLDOWN`) and logged in `user_timezone_changes`.
- **No global midnight cron.** Streak state is derived from stored `streak_days` rows.

**Credit and continuity** (executed inside the completion transaction, §18.2):
1. If the session is qualifying, compute `today = local_date`.
2. If a `streak_days` row for `today` exists, nothing changes (idempotent).
3. Otherwise let `last` = most recent `streak_days.local_date`. Let `gap = days between last and today − 1` (missed days).
4. If `gap = 0` or there is no prior row, insert `(user, today, PLAYED)`.
5. If `1 ≤ gap ≤ available_freezes` (max 2 held), consume `gap` freezes (oldest first) and insert one `FROZEN` row per missed date, then insert today as `PLAYED`.
6. If `gap > available_freezes`, the streak restarts: insert today as `PLAYED` (previous rows remain for history; freezes are **not** consumed).

**Current streak length** = number of consecutive dates (`PLAYED` or `FROZEN`) ending on `today` or `yesterday` (user local). Read-time display states: `ACTIVE_TODAY`, `AT_RISK` (last row is yesterday), `PROTECTED` (gap ≤ available freezes), `BROKEN`.

**Freezes:** 1 freeze is earned each time the streak length reaches a multiple of 7, if the user holds fewer than 2. `UNIQUE(user_id, earned_on_local_date)` prevents duplicate grants.

**Milestones** (3, 7, 14, 30, 50, 100, 365 days) show celebratory UI in MVP; milestone badges/points arrive with achievements in V1.

`streak_summary` is a rebuildable cache (`current_len`, `longest_len`, `last_local_date`, `freezes_available`) updated in the same transaction.

### 12.2 Weekly Leaderboards: Alpha (global), Social Beta (friends)
- **Week key:** ISO-8601 week in **UTC**, `YYYY-Www`; weeks start Monday 00:00 UTC. The same rule applies to global and friends boards. Regional boards are deferred.
- Each ledger row stores `week_key` computed from its UTC `created_at`.
- **Canonical:** `SUM(point_ledger.final_points) GROUP BY user_id, week_key` in Postgres.
- **Projection:** Redis sorted set `leaderboard:{week_key}:global`. New weeks use new keys; **there is no destructive reset**. Keys expire after 8 weeks; history remains queryable from Postgres.
- **Writes are idempotent:** the `leaderboard/project-user` job recomputes the user's weekly sum from Postgres and `ZADD`s the absolute value (never `ZINCRBY`).
- **Friends board:** read the user's accepted friend ids plus self and fetch scores with `ZMSCORE` from the global set. Fallback: Postgres aggregate query over those ids.
- **Rebuild:** `leaderboard/rebuild-week` job reconstructs any week key from Postgres.
- Leagues are deferred (§26).

### 12.3 Friends: Social Beta
First social phase scope: add friend (username or invite link), accept / decline / cancel, remove, block, invite friend to a lobby, friends leaderboard, simple friend multiplier. Friendship levels, friend streaks and complex feeds are deferred.

**Friend multiplier eligibility** (all checked server-side at match completion):
- The friendship is `ACCEPTED` and `accepted_at` is at least 24 hours before the match started.
- Neither user has blocked the other.
- The pair has earned the friend multiplier in fewer than **5** sessions that UTC day (`friend_bonus_grants`). Beyond the cap, matches remain playable without the multiplier.
- At most 3 eligible friends are counted per player.

**Blocking:** a block removes any friendship (`→ REMOVED`), rejects new friend requests in both directions, prevents the pair from joining the same lobby, and hides each from the other's leaderboards and feeds.

### 12.4 Achievements: V1
Examples: *Renaissance Mind* (proficiency ≥ 70 with confidence ≥ 0.5 in 3 categories), *Weakness Slayer* (10 completed recommendations), *Team Player* (10 deathmatch wins with friends). Evaluated by a post-commit job; grants are unique per `(user_id, achievement_id)`. MVP may include one hard-coded test achievement solely to exercise the pipeline.

### 12.5 Healthy Engagement Guardrails
- Streak freezes exist so one missed day doesn't end a streak.
- Optional daily goal and session-length reminder ("Nice work, time for a break?" after 45 minutes of continuous play) in settings.
- No loot boxes, no pay-to-win, no purchasable streak repair.
- Notifications (V1): opt-in, at most 1 reminder push per day, user-configurable quiet hours.
- Points reward learning signals, not time spent (§10).
- If the confirmed audience includes minors: parental consent flow, preset-message-only communication, and applicable child-privacy compliance become release blockers (§19, §28).

---

## 13. Content Model & Publishing

### 13.1 Roles
`user_roles(user_id, role)` with roles `AUTHOR`, `REVIEWER`, `ADMIN`. A reviewer MUST NOT approve a version they authored.

### 13.2 Versioning and Immutability
- `questions` is a stable identity. `question_versions` hold assessable content.
- **Assessment-critical fields** (live on the version, immutable once the version leaves `DRAFT`): `type`, `prompt`, `options_json`, `answer_json` (incl. tolerance), `explanation`, `category_id`, `sub_topic`, `difficulty`, `rating`.
- Editing any of these creates a new version (`version_number + 1`) starting in `DRAFT`.
- At most **one `LIVE` version per question** (partial unique index). Publishing a new version moves the previous `LIVE` version to `ARCHIVED` in the same transaction.
- Answers and learning events reference `question_version_id`, so historical review always shows exactly what the learner saw.
- Versions referenced by answers are never deleted (`ON DELETE RESTRICT`).
- Scenarios (`scenarios`, `scenario_versions`) and mini-game generator templates (`generator_templates`, `generator_template_versions`) follow the same rules.

### 13.3 Publishing Workflow
```
DRAFT ──► IN_REVIEW ──► APPROVED ──► LIVE ──► ARCHIVED
  ▲            │
  └────────────┘ (changes requested)
```
- `ARCHIVED` removes the version from new sessions without breaking historical references.
- Every transition writes a `content_audit_log` row (actor, from, to, note, timestamp).
- **AI-generated content** has `origin = AI_GENERATED`. It MUST pass `IN_REVIEW → APPROVED` by a human `REVIEWER`; there is no path from `DRAFT` to `LIVE` without human approval. Never auto-publish generated assessment content.

### 13.4 Content Pipeline by Stage
- **MVP:** content is authored as JSON files in `content/` in the repo. Review happens through pull request. An idempotent import command (`pnpm content:import`) upserts by `(question_external_id, version_number)`, records `reviewed_by` from the file's metadata, and publishes to `LIVE`. The command refuses to modify an existing version whose content hash differs (it must be a new version).
- **Alpha:** admin publishing UI implementing §13.3, with role checks and audit log.

### 13.5 Metadata
Each version records `source`, `license`, `origin` (`HUMAN | AI_GENERATED | DEV_SEED`), `author_id`, `reviewed_by`, `reviewed_at`, `published_at`, `archived_at`, `content_hash`, `created_at`, `updated_at`. Externally sourced material MUST record source and license.

### 13.6 Seed Data Quality
- **Development seed** (`origin = DEV_SEED`, never imported into production): for each launch category, at least 12 questions covering every difficulty 1 to 5 (≥ 2 per level), each with a correct answer, plausible distractors and a real explanation. No meaningless filler.
- **Fixture users** with scripted learning histories covering: a strong category, a low-skill weak category, a never-played category and a stale category, so weak-category detection, recommendations and multipliers are testable.
- **Launch content target:** ≥ 150 reviewed questions per launch category (≥ 30 per difficulty level) before public launch.
- Seeds are deterministic (fixed ids and PRNG seeds).

---

## 14. Data Model (PostgreSQL)

### 14.1 Conventions
- **IDs:** UUID v7 (time-ordered), generated server-side. Invite codes are separate random strings.
- **Timestamps:** `timestamptz`, stored UTC, server-generated. Client timestamps are stored only in `*_client_at` diagnostic columns.
- **Enums:** Postgres enums (declared via Drizzle `pgEnum`). No free-form status strings.
- **Money-like values:** points are `integer`; intermediate scoring values are `numeric(12,4)`.
- **Derived values** are never stored as canonical. Caches are named `*_cached` or live in `*_summary` tables, and each has a documented rebuild procedure.
- **Deletes:** users are soft-deleted (`deleted_at`) until the V1 deletion flow (§19.4). Canonical history tables (`answers`, `learning_events`, `skill_updates`, `point_ledger`, `game_sessions`) are never hard-deleted by the application.
- **Access:** the browser never talks to Postgres directly. Row Level Security is enabled with deny-all for the `anon` and `authenticated` roles; the server connects with a privileged role.

### 14.2 Tables (stage in brackets)

```sql
-- ===== Identity =====  [MVP]
users(
  id uuid PK,                      -- = Supabase auth user id
  username citext UNIQUE NOT NULL, -- 3..20 chars, [a-z0-9_]
  display_name text NOT NULL,
  timezone text NOT NULL,          -- IANA id, validated
  age_confirmed_at timestamptz,
  onboarding_completed_at timestamptz,
  total_points_cached bigint NOT NULL DEFAULT 0,   -- cache of SUM(point_ledger.final_points)
  created_at, updated_at, deleted_at
)
user_roles(user_id FK→users CASCADE, role user_role, PRIMARY KEY(user_id, role))            -- [MVP]
user_timezone_changes(id, user_id FK→users, old_tz, new_tz, changed_at)                     -- [MVP]

-- ===== Taxonomy =====  [MVP]
categories(id, slug UNIQUE, name, icon, status category_status /* LAUNCH|ACTIVE|DEFERRED */)
game_types(id, slug UNIQUE, name, mode game_mode /* SOLO|COOP|VERSUS */, status game_type_status /* ENABLED|DISABLED */)
game_type_categories(
  game_type_id FK→game_types CASCADE,
  category_id  FK→categories CASCADE,
  PRIMARY KEY(game_type_id, category_id)
)

-- ===== Content =====  [MVP]
questions(id, external_id text UNIQUE, author_id FK→users SET NULL, created_at, archived_at)
question_versions(
  id, question_id FK→questions RESTRICT, version_number int NOT NULL,
  status content_status NOT NULL,            -- DRAFT|IN_REVIEW|APPROVED|LIVE|ARCHIVED
  origin content_origin NOT NULL,            -- HUMAN|AI_GENERATED|DEV_SEED
  type question_type NOT NULL,               -- MCQ|NUMERIC (ORDER|MATCH in Alpha)
  category_id FK→categories RESTRICT, sub_topic text,
  prompt text, options_json jsonb, answer_json jsonb, explanation text NOT NULL,
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  rating numeric(7,2) NOT NULL,              -- = 700 + 100*difficulty at creation, fixed in MVP
  source text, license text, content_hash text NOT NULL,
  author_id FK→users SET NULL, reviewed_by FK→users SET NULL,
  reviewed_at, published_at, archived_at, created_at, updated_at,
  UNIQUE(question_id, version_number),
  CHECK (reviewed_by IS NULL OR reviewed_by <> author_id)
)
-- partial unique: one LIVE version per question
CREATE UNIQUE INDEX one_live_version ON question_versions(question_id) WHERE status = 'LIVE';
content_audit_log(id, actor_id, entity_type, entity_id, from_status, to_status, note, created_at)  -- [MVP: written by import]
admin_audit_log(id, actor_id, action, target_type, target_id, before_json, after_json, created_at)  -- [Alpha]

-- ===== Sessions & answers =====  [MVP]
game_sessions(
  id, game_type_id FK RESTRICT, mode game_mode NOT NULL,  -- copied from game_types at creation
  category_id FK NULL,                       -- NULL for mixed-category modes
  owner_id FK→users RESTRICT,
  status session_status NOT NULL,            -- §15.1
  weakness_tier weakness_tier NOT NULL,      -- NONE|WEAK|RECOMMENDED (snapshot, §11.8)
  weakness_snapshot_json jsonb NOT NULL,
  recommendation_id FK→recommendations NULL,
  daily_challenge_id FK NULL,                -- [Alpha]
  question_count smallint, time_limit_ms int,
  creation_idempotency_key uuid NOT NULL,
  local_date date NULL, is_qualifying bool NULL,    -- set on COMPLETED
  result_json jsonb NULL,                    -- frozen results payload for idempotent /complete
  created_at, started_at, last_activity_at, ended_at, post_processed_at,
  UNIQUE(owner_id, creation_idempotency_key)
)
CREATE UNIQUE INDEX one_open_solo_session ON game_sessions(owner_id)
  WHERE status IN ('CREATED','ACTIVE') AND mode = 'SOLO';
session_players(session_id FK CASCADE, user_id FK RESTRICT, team team_side NULL, placement smallint NULL,
  PRIMARY KEY(session_id, user_id))          -- solo sessions have exactly one row
session_questions(
  session_id FK CASCADE, position smallint, question_version_id FK RESTRICT,
  served_at NULL, deadline_at NULL,
  PRIMARY KEY(session_id, position), UNIQUE(session_id, question_version_id)
)
answers(
  id, session_id FK RESTRICT, user_id FK RESTRICT, question_version_id FK RESTRICT, position smallint,
  outcome answer_outcome NOT NULL,           -- ANSWERED|TIMEOUT
  response_json jsonb NULL, correctness numeric(4,3) NOT NULL CHECK (correctness BETWEEN 0 AND 1),
  speed_factor numeric(5,4) NOT NULL, response_time_ms int NULL,
  server_received_at timestamptz NOT NULL, client_sent_at timestamptz NULL,
  UNIQUE(session_id, user_id, question_version_id)   -- single attempt per question in all modes
)
learning_events(
  id, user_id FK RESTRICT, session_id FK RESTRICT, game_type_id FK, source_key text NOT NULL,
  question_version_id FK NULL, answer_id FK NULL UNIQUE,
  category_id FK, sub_topic text NULL, difficulty_rating numeric(7,2),
  correctness numeric(4,3) CHECK (correctness BETWEEN 0 AND 1), timed_out bool, response_time_ms int NULL,
  occurred_at, created_at,
  UNIQUE(session_id, user_id, source_key)
)
INDEX learning_events(user_id, category_id, occurred_at)

-- ===== Coach =====  [MVP]
skill_profiles(
  user_id FK CASCADE, category_id FK RESTRICT,
  rating numeric(7,2) NOT NULL DEFAULT 1000,  -- canonical
  lifetime_event_count int NOT NULL DEFAULT 0,
  last_event_at timestamptz NULL, updated_at,
  PRIMARY KEY(user_id, category_id)
)  -- proficiency, confidence, weakness_score are derived at read time (§11.4)
skill_updates(
  id, learning_event_id FK UNIQUE, user_id, category_id,
  rating_before numeric(7,2), rating_after numeric(7,2), expected numeric(6,5), k_factor smallint, created_at
)
recommendations(
  id, user_id FK CASCADE, local_date date NOT NULL,
  category_id FK, game_type_id FK, target_rating numeric(7,2),
  status recommendation_status NOT NULL,     -- §15.5
  reason_json jsonb NOT NULL,                -- inputs snapshot incl. seed
  completed_session_id FK→game_sessions NULL UNIQUE,
  created_at, started_at, completed_at, expired_at,
  UNIQUE(user_id, local_date)
)

-- ===== Points =====  [MVP]
point_ledger(
  id, user_id FK RESTRICT, session_id FK NULL,
  reason ledger_reason NOT NULL,             -- SESSION_COMPLETION|DAILY_CHALLENGE_BONUS|ACHIEVEMENT|ADJUSTMENT
  raw_base_points numeric(12,4), combo_adjusted_points numeric(12,4),
  multipliers_json jsonb NOT NULL,           -- every multiplier + components + inputs
  uncapped_points numeric(12,4), cap_applied bool,
  final_points integer NOT NULL,
  week_key text NOT NULL,                    -- 'YYYY-Www' from created_at (UTC)
  idempotency_key text NOT NULL UNIQUE,      -- e.g. 'session:{sid}:user:{uid}:SESSION_COMPLETION'
  adjusts_ledger_id FK→point_ledger NULL,    -- for ADJUSTMENT rows
  created_at
)
INDEX point_ledger(week_key, user_id)
-- Append-only: UPDATE/DELETE revoked for the app role + trigger that raises on UPDATE/DELETE.

-- ===== Streaks =====  [MVP]
streak_days(user_id FK CASCADE, local_date date, source streak_day_source /* PLAYED|FROZEN */,
  session_id FK NULL, freeze_id FK NULL, created_at, PRIMARY KEY(user_id, local_date))
streak_freezes(id, user_id FK CASCADE, status freeze_status /* AVAILABLE|CONSUMED */,
  earned_on_local_date date, consumed_for_local_date date NULL, created_at, consumed_at,
  UNIQUE(user_id, earned_on_local_date), UNIQUE(user_id, consumed_for_local_date))
streak_summary(user_id PK FK CASCADE, current_len int, longest_len int, last_local_date date,
  freezes_available smallint, updated_at)   -- rebuildable cache

-- ===== Alpha =====
daily_challenges(id, challenge_date date UNIQUE, created_by, created_at)
daily_challenge_questions(daily_challenge_id FK CASCADE, position, question_version_id FK RESTRICT,
  PRIMARY KEY(daily_challenge_id, position))
scenarios / scenario_versions            -- same versioning shape as questions; graph_json on the version
generator_templates / generator_template_versions

-- ===== Social Beta =====
friendships(
  id, user_low_id FK CASCADE, user_high_id FK CASCADE,   -- normalized pair: user_low_id < user_high_id
  requested_by FK, status friendship_status NOT NULL,     -- §15.4
  created_at, responded_at, accepted_at, ended_at,
  CHECK (user_low_id < user_high_id), UNIQUE(user_low_id, user_high_id)
)
user_blocks(blocker_id FK CASCADE, blocked_id FK CASCADE, created_at, PRIMARY KEY(blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id))
invite_links(id, code text UNIQUE, created_by FK, purpose invite_purpose, expires_at, max_uses, uses, created_at)

-- ===== Multiplayer Beta =====
lobbies(id, code text NOT NULL, host_id FK, game_type_id FK, status lobby_status, max_players smallint,
  session_id FK NULL, created_at, expires_at, closed_at)
CREATE UNIQUE INDEX active_lobby_code ON lobbies(code) WHERE status IN ('OPEN','STARTING','IN_MATCH');
lobby_members(lobby_id FK CASCADE, user_id FK, team team_side NULL, is_ready bool, joined_at, left_at,
  PRIMARY KEY(lobby_id, user_id))
match_results(session_id PK FK, winner team_side NULL, is_draw bool, final_state_json jsonb, rounds_played smallint, created_at)
friend_bonus_grants(user_low_id, user_high_id, utc_date date, session_id FK,
  PRIMARY KEY(user_low_id, user_high_id, session_id))
INDEX friend_bonus_grants(user_low_id, user_high_id, utc_date)

-- ===== V1 =====
achievements(id, slug UNIQUE, name, description, criteria_json)
user_achievements(user_id FK CASCADE, achievement_id FK, earned_at, source_ref, PRIMARY KEY(user_id, achievement_id))
coach_messages(id, user_id FK CASCADE, kind coach_message_kind /* POST_SESSION|WEEKLY */, session_id NULL, week_key NULL,
  content text, is_template_fallback bool, model text NULL, input_snapshot_json jsonb, created_at,
  UNIQUE(user_id, kind, session_id), UNIQUE(user_id, kind, week_key))
event_multipliers(id, name, multiplier numeric(3,2) CHECK (multiplier BETWEEN 1 AND 2),
  category_id NULL, starts_at, ends_at, created_by, created_at)  -- app rejects overlapping windows
push_subscriptions(id, user_id FK CASCADE, endpoint UNIQUE, keys_json, created_at)
notification_preferences(user_id PK, reminders_enabled, quiet_start, quiet_end, updated_at)
activity_events(id, actor_id, kind, ref_id, created_at, UNIQUE(actor_id, kind, ref_id))
```

### 14.3 Rebuild Procedures for Caches
| Cache | Canonical source | Rebuild |
|---|---|---|
| `users.total_points_cached` | `point_ledger` | `pnpm admin:rebuild-totals [--user]` sets it to `SUM(final_points)` |
| `streak_summary` | `streak_days`, `streak_freezes` | `pnpm admin:rebuild-streaks [--user]` |
| Redis leaderboards | `point_ledger` | Inngest `leaderboard/rebuild-week` |
| `game_sessions.result_json` | ledger row + answers | regenerated by the results serializer if missing |

A nightly `consistency/check` job samples users, compares caches with canonical values, logs drift and repairs it.

### 14.4 Migration Rules
- Migrations are generated with `drizzle-kit generate` and checked into `db/migrations/`.
- `drizzle-kit push` is allowed **only** against a local database (`APP_ENV=local`); the command wrapper refuses otherwise.
- No destructive production migration (drop column/table, type narrowing) without an ADR and explicit human review.
- Migrations MUST preserve historical learning records and content-version references.
- `pnpm db:reset` works only when `APP_ENV=local` or `APP_ENV=test`.

---

## 15. State Machines

Every status column uses a Postgres enum. Transitions are implemented in one module per entity (`*/transitions.ts`) that exposes `canTransition(from, to)` and a guarded update (`UPDATE … WHERE status = :from`). Illegal transitions throw `INVALID_STATE_TRANSITION` and are unit-tested exhaustively (every pair).

### 15.1 GameSessionStatus
| State | Meaning |
|---|---|
| `CREATED` | Questions allocated; no question served yet |
| `ACTIVE` | At least one question served; play in progress |
| `COMPLETED` | All questions resolved and completion processed; rewards issued (terminal) |
| `ABANDONED` | User quit explicitly (terminal) |
| `EXPIRED` | No activity for 30 min (terminal) |
| `CANCELLED` | Cancelled before start, or multiplayer match aborted (terminal) |

```
CREATED -> ACTIVE        first question served
CREATED -> CANCELLED     user cancels
CREATED -> EXPIRED       30 min inactivity
ACTIVE  -> COMPLETED     /complete with all questions resolved (or match finished)
ACTIVE  -> ABANDONED     /abandon
ACTIVE  -> EXPIRED       30 min inactivity
ACTIVE  -> CANCELLED     multiplayer only: match aborted
```
Expiry is applied lazily on any access and by an hourly `sessions/expire-stale` sweep.

### 15.2 LobbyStatus (Multiplayer Beta)
| State | Meaning |
|---|---|
| `OPEN` | Accepting joins; members toggle ready |
| `STARTING` | All members ready and ≥ minimum players; 5-second countdown |
| `IN_MATCH` | Match running (linked session) |
| `CLOSED` | Match ended; lobby done (terminal) |
| `EXPIRED` | Idle 15 min in `OPEN` (terminal) |
| `CANCELLED` | Host cancelled or everyone left (terminal) |
```
OPEN -> STARTING    all ready, min players met
STARTING -> OPEN    a member un-readies or leaves during countdown
STARTING -> IN_MATCH countdown finished
IN_MATCH -> CLOSED  match reached a terminal state
OPEN -> EXPIRED | CANCELLED
STARTING -> CANCELLED
```

### 15.3 MatchStatus (realtime server memory; persisted outcome in `game_sessions`)
| State | Meaning |
|---|---|
| `WAITING_FOR_PLAYERS` | Session created; waiting for all members to connect (max 30 s) |
| `IN_PROGRESS` | Rounds running |
| `FINALIZING` | Last round over; writing results transaction |
| `FINISHED` | Results committed (session `COMPLETED`) |
| `ABORTED` | Not all connected in 30 s, all players disconnected past the reconnect window, or unrecoverable server error (session `CANCELLED`, no rewards) |
```
WAITING_FOR_PLAYERS -> IN_PROGRESS | ABORTED
IN_PROGRESS -> FINALIZING | ABORTED
FINALIZING -> FINISHED | ABORTED (only if the results transaction fails after 3 retries)
```

### 15.4 FriendshipStatus (Social Beta)
| State | Meaning |
|---|---|
| `PENDING` | Request sent by `requested_by` |
| `ACCEPTED` | Friends |
| `DECLINED` | Recipient declined |
| `CANCELLED` | Requester withdrew |
| `REMOVED` | Either user removed the friendship, or a block occurred |
```
PENDING -> ACCEPTED | DECLINED | CANCELLED
ACCEPTED -> REMOVED
DECLINED | CANCELLED | REMOVED -> PENDING   re-request (same row; 24 h cooldown after DECLINED)
```
Any state → `REMOVED` when a block is created. No transition out while a block exists.

### 15.5 RecommendationStatus
| State | Meaning |
|---|---|
| `AVAILABLE` | Generated for today; not yet started |
| `IN_PROGRESS` | A session was started from it and is open |
| `COMPLETED` | First qualifying completion recorded; bonus granted (terminal) |
| `EXPIRED` | Its local date passed without completion (terminal; applied lazily) |
```
AVAILABLE -> IN_PROGRESS     session created from it
IN_PROGRESS -> AVAILABLE     that session abandoned/expired/cancelled, or completed non-qualifying
IN_PROGRESS -> COMPLETED     that session completed and qualifying
AVAILABLE | IN_PROGRESS -> EXPIRED
```

### 15.6 StreakFreezeStatus
```
AVAILABLE -> CONSUMED   consumed during streak credit to cover a missed date (§12.1)
```
Freezes never expire in MVP.

### 15.7 ContentStatus
See §13.3. Legal: `DRAFT→IN_REVIEW`, `IN_REVIEW→DRAFT`, `IN_REVIEW→APPROVED`, `APPROVED→LIVE`, `APPROVED→DRAFT`, `LIVE→ARCHIVED`. MVP's import command performs `DRAFT→IN_REVIEW→APPROVED→LIVE` in one audited transaction using PR reviewer metadata.

---

## 16. API Surface

All endpoints are Next.js route handlers under `/api`, validated with **Zod**, authenticated via Supabase session cookies, and returning JSON. Every protected route checks authentication **and** ownership of the addressed resource.

### 16.1 Error Envelope
```json
{ "error": { "code": "SESSION_ALREADY_COMPLETED", "message": "This session has already been completed.", "details": {} } }
```
Clients branch on `code` only; `message` is human-readable and may change.

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but not the owner / lacks role |
| `ONBOARDING_REQUIRED` | 403 | Gameplay before onboarding is complete |
| `INVALID_INPUT` | 400 | Zod validation failed |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 16 KB |
| `NOT_FOUND` / `SESSION_NOT_FOUND` | 404 | Resource missing or not visible to user |
| `ACTIVE_SESSION_EXISTS` | 409 | Opening a second solo session (`details.sessionId`) |
| `INVALID_SESSION_STATE` | 409 | Action not legal in the session's current state |
| `SESSION_NOT_FINISHED` | 409 | `/complete` before all questions resolved |
| `SESSION_ALREADY_COMPLETED` | 409 | Answering or abandoning a completed session |
| `QUESTION_NOT_CURRENT` | 409 | Answer for a question that isn't the currently served one |
| `QUESTION_EXPIRED` | 409 | Answer after deadline + grace (question resolved as TIMEOUT) |
| `ANSWER_ALREADY_SUBMITTED` | 409 | A *different* response for an already-answered question |
| `TIMEZONE_CHANGE_COOLDOWN` | 409 | Second timezone change within 24 h |
| `USERNAME_TAKEN` | 409 | Onboarding / profile |
| `RATE_LIMITED` | 429 | Rate limit exceeded (`Retry-After` header) |
| `INTERNAL_ERROR` | 500 | Unexpected failure (logged with request id) |

### 16.2 Endpoints

**MVP**
```
GET    /api/me                          profile, onboarding state, streak display state, total points, weekly points
POST   /api/me/onboarding               {username, displayName, timezone, ageConfirmed:true}   idempotent
PATCH  /api/me                          {displayName?, timezone?}
GET    /api/me/skills                   per-category rating, derived proficiency/confidence/weakness, strengths, weaknesses
GET    /api/me/recommendation           today's recommendation (lazily created); idempotent
GET    /api/me/history?cursor=          completed sessions with points

GET    /api/categories                  launch categories with live-question counts
POST   /api/sessions                    Header Idempotency-Key: <uuid>
                                        {gameType:"quiz_solo", categorySlug, recommendationId?}
                                        → {sessionId, status:"CREATED", questionCount, timeLimitMs}
POST   /api/sessions/:id/next           serve next question (idempotent: returns the currently open question if one is open)
                                        → {position, question:{id, prompt, type, options}, deadlineAt}  (no answer data)
POST   /api/sessions/:id/answer         {position, questionVersionId, response, clientSentAt?}
                                        → {correct, correctness, correctAnswer, explanation, speedFactor,
                                           comboAfter, sessionFinished}
POST   /api/sessions/:id/complete       → {pointsBreakdown, finalPoints, streak, recommendationCompleted,
                                           review:[missed questions with explanations]}   idempotent
POST   /api/sessions/:id/abandon        idempotent if already ABANDONED
POST   /api/sessions/:id/cancel         only from CREATED
GET    /api/sessions/:id                session state; results payload if COMPLETED; skill deltas when post-processed
```

**Alpha:** `GET /api/leaderboards?scope=global&week=current|YYYY-Www`, `GET /api/daily-challenge`, scenario and mini-game session variants, `/api/admin/content/*` (role-guarded, audited).

**Social Beta:** `GET /api/friends`, `POST /api/friends/requests {username}`, `POST /api/friends/requests/:id/{accept|decline|cancel}`, `DELETE /api/friends/:userId`, `POST /api/blocks {userId}`, `DELETE /api/blocks/:userId`, `POST /api/invites`, `GET /api/leaderboards?scope=friends`.

**Multiplayer Beta:** `POST /api/lobbies {gameType}` → `{code}`, `POST /api/lobbies/:code/join`, `POST /api/realtime/token` → short-lived signed token for the socket handshake.

**V1:** `GET /api/me/coach/latest`, `GET /api/me/achievements`, `POST /api/push/subscribe`, `GET /api/feed`, `POST /api/me/export`, `POST /api/me/delete`.

### 16.3 Duplicate-submission Semantics
- Same `(session, position, questionVersionId)` with an **identical** response → `200` with the originally stored result (idempotent replay).
- Different response for an already-answered question → `409 ANSWER_ALREADY_SUBMITTED`.
- `/complete` on a `COMPLETED` session → `200` with the stored `result_json`.

---

## 17. Realtime Protocol (Multiplayer Beta)

A separate Node service (`apps/realtime`) using **Socket.IO**. It is authoritative for all in-match state.

### 17.1 Authentication & Authorization
- The client obtains a token from `POST /api/realtime/token` (HMAC-signed with a shared server secret: `userId`, `lobbyId`, `exp` = 2 min).
- The Socket.IO handshake MUST present the token; invalid/expired → disconnect.
- A socket may only join the room for the lobby in its token and only if the user is a current `lobby_members` row and not blocked by any member.
- Every inbound event is Zod-validated; per-socket rate limit 10 events/s.

### 17.2 Events
**Client → Server** (each carries a client-generated `clientEventId` uuid):
`ready {isReady}`, `submit_answer {roundId, response}`, `vote {questionId, response}`, `leave`.

**Server → Client:** `lobby_state`, `match_start {teams, hp, reconnectToken}`, `question {roundId, prompt, options, deadlineAt}`, `answer_ack {clientEventId, accepted, reason?}`, `round_result {perPlayer, damage, hp}`, `state_snapshot` (on reconnect), `match_end {outcome, pointsBreakdown, review}`.

### 17.3 Timing
Deadlines and speed factors use **server receive time**. `clientSentAt` is logged for diagnostics only. Grace window 500 ms.

### 17.4 Idempotency & Reconnect
- The server keeps a per-(match, user) set of processed `clientEventId`s; duplicates receive the original `answer_ack` and have no effect.
- Each player has at most one answer per round (`Map<roundId, Map<userId, answer>>`); later submissions are rejected with `answer_ack {accepted:false, reason:"ALREADY_ANSWERED"}`.
- Damage, scores and assists are computed once at round resolution from the stored answers; they are never recomputed or replayed on reconnect.
- **Reconnect:** `reconnectToken` (signed: matchId, userId, exp) lets a dropped player rejoin within **30 s**; the server sends a full `state_snapshot`. During absence the player's rounds resolve as `TIMEOUT`. After 30 s the player is marked disconnected for the rest of the match (still receives rewards only if the match completes and they resolved ≥ 50% of rounds).

### 17.5 Persistence
- Transient state (rounds, HP, votes) stays in memory; no database round-trip per event.
- On `FINALIZING`, one Postgres transaction writes: session `COMPLETED`, `session_players`, `answers`, `learning_events`, `match_results`, `friend_bonus_grants`, streak credit, and `point_ledger` rows for each player. **Canonical match results are written before any reward is visible.**
- If the realtime process crashes mid-match, the match is `ABORTED` (session `CANCELLED`, no rewards, no learning events). This trade-off is recorded in `DECISIONS.md`.
- Single realtime instance in Multiplayer Beta; horizontal scaling (Redis adapter + sticky sessions) is deferred.

---

## 18. Idempotency & Transactions

### 18.1 Idempotency Rules
| Operation | Mechanism |
|---|---|
| Session creation | `Idempotency-Key` header → `UNIQUE(owner_id, creation_idempotency_key)`; retry returns the existing session. Plus one-open-solo-session partial index. |
| Serve next question | Returns the currently open question if `served_at` is set and it's unresolved; never serves two at once. |
| Answer submission | `UNIQUE(session_id, user_id, question_version_id)`; identical retry returns stored result (§16.3). |
| Learning events | `UNIQUE(session_id, user_id, source_key)` + `answer_id UNIQUE`. |
| Session completion | Row lock + terminal-state check; `point_ledger.idempotency_key UNIQUE`; `result_json` returned on retry. |
| Streak credit | `streak_days` PK `(user_id, local_date)`; freeze uniques. |
| Recommendation completion | Guarded `UPDATE … WHERE status IN ('AVAILABLE','IN_PROGRESS')` + `completed_session_id UNIQUE`. |
| Skill updates | `skill_updates.learning_event_id UNIQUE`; job skips already-applied events. |
| Leaderboard projection | Absolute `ZADD` of the recomputed weekly sum (never increments). |
| Achievements | PK `(user_id, achievement_id)`. |
| Activity events | `UNIQUE(actor_id, kind, ref_id)`. |
| Coach messages | `UNIQUE(user_id, kind, session_id)` / `(user_id, kind, week_key)`. |
| Multiplayer | `clientEventId` dedupe; one answer per round per player; single results transaction keyed by session id. |
| Background jobs | Inngest event ids are deterministic (e.g. `coach-process:{sessionId}`), so duplicate sends are deduplicated; every job body is itself idempotent via the constraints above. |

Retries of any of these MUST NOT duplicate answers, points, rewards, streak updates, skill changes, recommendation credits, leaderboard entries, achievements or activity events.

### 18.2 Session Completion Transaction (synchronous)
Executed in a single serializable-safe transaction (`SELECT … FOR UPDATE` on the session row):
1. **Lock** the session row.
2. If `COMPLETED`: return stored `result_json` (no writes). If `ABANDONED | EXPIRED | CANCELLED`: `409 INVALID_SESSION_STATE`.
3. **Resolve** any served question past `deadline_at + grace` without an answer as `TIMEOUT` (answer row + learning event). If any question is unserved or still open → `409 SESSION_NOT_FINISHED`.
4. **Determine** `local_date` (user timezone now) and `is_qualifying` (≥ 50% `ANSWERED`).
5. **Streak credit** if qualifying (§12.1): `streak_days`, freeze consumption/grant, `streak_summary`.
6. **Recommendation:** lock the linked recommendation; if eligible and qualifying → `COMPLETED`, else `→ AVAILABLE` if it was `IN_PROGRESS`. Resolve the final `weakness_tier` (§11.8).
7. **Improvement bonus** evaluation (§11.7).
8. **computePoints()** (pure) → insert `point_ledger` row with deterministic `idempotency_key`.
9. `users.total_points_cached += final_points`.
10. **Mark session `COMPLETED`** with `ended_at`, `local_date`, `is_qualifying`, `result_json`.
11. Commit.

### 18.3 Post-commit Work (Inngest, retry-safe)
After commit, the handler sends `session/terminal {sessionId}` (event id `session-terminal:{sessionId}`). The same event is sent after `ABANDONED`/`EXPIRED`. Consumers:
- `coach/process-session`: apply Elo updates for the session's learning events (concurrency key = `user_id`, so one user's updates run serially), upsert `skill_profiles`, set `post_processed_at`.
- `leaderboard/project-user` (Alpha).
- `achievements/evaluate` (V1), `coach/narrate-session` (V1), `feed/publish` (V1).
- Analytics events (observational only).

**Reconciliation:** the hourly `sessions/reconcile` job finds terminal sessions with `post_processed_at IS NULL` older than 10 minutes and re-sends `session/terminal`. This covers a failed send after commit.

### 18.4 Source-of-truth Rules
- Postgres (`point_ledger`, `learning_events`, `skill_updates`, `streak_days`) is canonical.
- If Redis and Postgres disagree, **Postgres wins** and Redis is rebuilt.
- If Redis is unavailable, gameplay and point awards proceed; projection jobs retry.

---

## 19. Security, Abuse & Privacy

### 19.1 Security
- Authentication required for all gameplay and user data routes; authorization check on every user-owned resource (session owner, lobby member, friendship party).
- Admin/content routes require `ADMIN`/`REVIEWER`/`AUTHOR` role; every admin action is written to `content_audit_log` or `admin_audit_log`.
- Input validation with Zod everywhere; request bodies ≤ 16 KB.
- **CSRF:** Supabase auth cookies are `SameSite=Lax`; all mutating route handlers additionally verify the `Origin` header matches the app origin.
- Secrets (DB URL, service keys, LLM keys, HMAC secrets) are server-only env vars and are never exposed to the client bundle (no `NEXT_PUBLIC_` prefix).
- No answer keys or correctness data in any payload before grading.
- No client-authoritative scoring, timing or outcomes.
- Realtime: signed handshake tokens, signed reconnect tokens, per-socket rate limits (§17).

### 19.2 Rate Limits (Upstash Ratelimit)
| Action | Limit |
|---|---|
| Session creation | 30 / hour / user |
| Answer submission | 5 / second / user |
| Friend requests | 20 / day / user |
| Lobby join by code | 10 / minute / user and 30 / minute / IP (brute-force protection; codes are 8 chars, unambiguous alphabet) |
| Auth endpoints | Supabase defaults |

If Upstash is unavailable, rate limiting **fails open** for gameplay and **fails closed** for lobby-code joins and friend requests; this choice is logged.

### 19.3 Anti-cheat
- Server-side grading and timing only.
- Flag (don't block) patterns: median response < 800 ms with > 95% accuracy across ≥ 3 sessions; logged as `anti_cheat.flag` for review.
- Friend-multiplier anti-farming rules (§12.3).
- Ledger is append-only, so suspicious awards are corrected with `ADJUSTMENT` rows.

### 19.4 Privacy & Data Minimization
- Collect only: email (auth), username, display name, timezone, age confirmation. No birth date, no real name required, no location.
- Coach/LLM inputs contain structured stats and `display_name` only.
- Analytics use internal user ids, never email.
- Logs never contain raw answers' free text beyond what's needed, emails, tokens or secrets.
- **Retention:** application logs 30 days; LLM input snapshots 90 days, then nulled; canonical learning data kept while the account exists.
- **V1 (public-launch blocker):** self-serve data export (JSON) and account deletion. Deletion anonymizes the user (username replaced, display name cleared, auth user removed) while keeping anonymized canonical records so aggregates and other players' match histories remain consistent.
- If minors are in scope: see §2 and §28; privacy and safety requirements become release blockers.

---

## 20. UX Screens

| # | Screen | Stage | Notes |
|---|---|---|---|
| 1 | Sign up / sign in | MVP | Email magic link + Google OAuth (Supabase) |
| 2 | Onboarding | MVP | Username, display name, timezone (auto-detected, editable), age confirmation (16+) |
| 3 | Home | MVP | Streak flame + display state, total & weekly points, "Focus today" card with bonus badge, category buttons |
| 4 | Category picker | MVP | Launch categories; weak ones show "×1.25 Focus" tag, recommended one "×1.5" |
| 5 | Quiz | MVP | One question at a time, server deadline countdown, instant feedback, combo indicator |
| 6 | Results | MVP | Animated points breakdown, streak update, recommendation completed, missed-question review with explanations, skill deltas (appear when post-processing finishes), "Play recommended next" |
| 7 | Skills | MVP | Radar chart (one axis per launch category, opacity by confidence), strengths/weaknesses list, per-category rating history |
| 8 | History | MVP | Past sessions → results page |
| 9 | Settings | MVP | Display name, timezone (with cooldown notice), daily goal, break reminder |
| 10 | Leaderboard | Alpha | Global (Alpha), Friends tab (Social Beta), reset countdown to Monday 00:00 UTC |
| 11 | Mini-games / Scenarios | Alpha | |
| 12 | Admin content | Alpha | Draft → review → publish, diff between versions, audit history |
| 13 | Friends | Social Beta | Requests, list, block, invite link / QR |
| 14 | Lobby & Match | Multiplayer Beta | Team assignment, ready state, HP bars, round results, post-match review |
| 15 | Coach messages, Achievements, Feed, Notifications settings | V1 | |

Every screen handles loading, empty and error states, and branches on error `code`s.

---

## 21. Technical Architecture

### 21.1 Canonical Stack (one choice per concern)

| Concern | Choice |
|---|---|
| Monorepo / package manager | **pnpm workspaces** + **Turborepo** (`apps/web`, `apps/realtime`, `packages/core`, `packages/db`) |
| Frontend framework | **Next.js (App Router)** |
| Language | **TypeScript** (strict mode) |
| Styling | **Tailwind CSS** |
| Components | **shadcn/ui** |
| Animation | **Framer Motion** |
| Charts | **Recharts** |
| Validation | **Zod** (shared schemas in `packages/core`) |
| Database | **PostgreSQL on Supabase** |
| ORM / migrations | **Drizzle ORM + drizzle-kit** |
| Auth | **Supabase Auth** (`@supabase/ssr`) |
| Cache / leaderboards / rate limits | **Upstash Redis** + **@upstash/ratelimit** |
| Background jobs & cron | **Inngest** |
| Realtime | **Socket.IO** (`apps/realtime`, Node) |
| Web hosting | **Vercel** |
| Realtime hosting | **Railway** |
| Date/time | **date-fns** + **@date-fns/tz** |
| Decimal arithmetic | **decimal.js** |
| Seeded PRNG | **seedrandom** |
| LLM (V1) | **Anthropic Claude API** (server-side only) |
| Email | **Resend** (via Supabase custom SMTP) |
| Web push (V1) | **web-push** (VAPID) |
| Error tracking & tracing | **Sentry** |
| Structured logs | **pino** (JSON) → **Axiom** |
| Product analytics | **PostHog** |
| Unit & integration tests | **Vitest** (integration against a local Supabase Postgres via `supabase start`) |
| E2E tests | **Playwright** |
| Realtime tests | **Vitest** + `socket.io-client` |
| Lint / format | **ESLint** + **Prettier** |
| CI | **GitHub Actions** |

### 21.2 Module Layout
```
packages/core/          pure domain logic (no I/O): scoring/, coach/, streaks/, transitions/, schemas/
packages/db/            Drizzle schema, migrations, repositories, rebuild commands
apps/web/               Next.js UI + route handlers + Inngest functions
apps/realtime/          Socket.IO match server (imports packages/core for scoring & transitions)
content/                reviewed question JSON (MVP content pipeline)
```
Pure logic lives in `packages/core` so it is unit-testable and shared by web and realtime servers.

### 21.3 Environments
`local` (supabase CLI + local Redis via Upstash emulator or docker redis), `test` (CI), `preview` (Vercel previews + Supabase branch), `production`. Destructive commands are allowed only in `local`/`test`.

---

## 22. Testing Strategy

### 22.1 Unit Tests (Vitest, `packages/core`)
Required for: `computePoints` (every §10 rule, the §10.3 worked example, caps, rounding), speed factor boundaries, combo resets, Elo update and K switch, proficiency conversion and clamping, confidence, weakness score (never-played, stale, strong), recommendation selection (ties, exploration seed), question selection ordering, improvement bonus thresholds, streak date calculations (DST transitions, timezone change, freeze consumption, restart), week-key calculation (ISO year boundaries), and exhaustive state-transition tables for every enum.

### 22.2 Integration Tests (Vitest + real Postgres)
Required for: session creation (incl. idempotency key and one-open-session rule), next-question serving, answer submission (grading, deadline, duplicate/identical/different), session completion (full transaction), idempotent completion retries (including concurrent calls: two parallel `/complete` requests produce one ledger row), point-ledger creation and append-only enforcement, streak credit, recommendation lifecycle, skill-update job idempotency, cache rebuild commands, leaderboard projection (Alpha).

### 22.3 E2E Tests (Playwright)
Critical journeys: sign up + onboarding; play a solo quiz; results & missed-question review; reload shows persisted progress; Coach recommendation shown and completed with bonus; streak updates across a simulated day (server clock override in `test` env only).

### 22.4 Realtime Tests (Multiplayer Beta)
Lobby join/leave, ready state and countdown, answer submission, timeout, duplicate `clientEventId`, reconnect within/after window, blocked-user rejection, match completion writes exactly one result transaction.

### 22.5 Test Rules
- Tests MUST NOT depend on wall-clock time; use an injectable `Clock` (`packages/core/clock.ts`).
- Randomness is always seeded.
- CI runs lint, typecheck, unit, integration and E2E on every PR.

---

## 23. Observability & Failure Modes

### 23.1 Structured Logs (pino → Axiom)
Every log line includes `request_id`, `user_id` (internal), `session_id` where relevant. Required events:
`session.created`, `session.completed`, `session.duplicate_complete`, `reward.issued`, `answer.duplicate`, `skill_update.failed`, `leaderboard.update_failed`, `realtime.disconnect`, `realtime.reconnect`, `anti_cheat.flag`, `job.failed`, `cache.drift_detected`, `ratelimit.degraded`.
Never log emails, tokens, secrets or full request bodies.

### 23.2 Metrics (log-derived in Axiom; errors/latency in Sentry)
Session completion rate, API error rate by code, answer submission latency (p50/p95), match disconnect rate, Coach job failure rate, idempotency conflict count, Redis reconciliation failures, cache drift count.

### 23.3 Performance Goals (engineering targets, not SLAs)
- Standard API responses: p95 < 300 ms excluding external services.
- `/complete`: p95 < 500 ms.
- Gameplay never blocks on LLM calls; coaching arrives asynchronously.
- Realtime: no database round-trip per transient event; canonical results written before rewards are shown.

### 23.4 Failure Modes
| Failure | Required behavior |
|---|---|
| Redis unavailable | Games complete; points persist in Postgres; leaderboard projection retries / rebuilds; leaderboard UI shows Postgres fallback or "temporarily unavailable" |
| LLM unavailable | Deterministic Coach unaffected; templated coaching copy used |
| Inngest send fails after commit | `sessions/reconcile` re-sends within an hour |
| Background job fails | Retries with backoff (Inngest, max 5); idempotency constraints prevent duplicates; final failure logged `job.failed` and alerted |
| Realtime disconnect | 30 s reconnect window; server state canonical; duplicate events ignored |
| Realtime process crash | Match `ABORTED`, session `CANCELLED`, no rewards; lobby members see an error and can re-queue |
| Postgres unavailable | Requests fail with `INTERNAL_ERROR`; no partial rewards (single transaction) |

---

## 24. Build Phases

Each phase lists its **scope**, a **prompt** to start the coding agent, and **acceptance criteria**. A phase is complete only when every criterion passes *and* the Global Definition of Done (§25) holds. Manual "it seems to work" is never sufficient.

---

### MVP

#### Phase 0: Foundations
**Scope:** monorepo, stack wiring, Drizzle schema for all MVP tables and enums, migrations, Supabase Auth, onboarding, content import pipeline, dev seed, CI, error envelope, logging, `Clock` abstraction, state-transition module skeletons.

**Prompt:**
> Read PLANNING.md fully. Implement Phase 0 only. Set up the pnpm/Turborepo monorepo from §21.2 with the canonical stack in §21.1. Create the Drizzle schema and first migration for every table tagged [MVP] in §14.2, with all enums, constraints, partial indexes and the append-only trigger on point_ledger. Wire Supabase Auth (email magic link + Google), the onboarding flow (§20 screen 2), the error envelope (§16.1), pino logging, Sentry, and the `content:import` command (§13.4). Add the dev seed (§13.6). Create DECISIONS.md with the ADRs in Appendix B. Record any new decisions there.

**Acceptance criteria**
- *User-visible:* a new user can sign up, is forced through onboarding, and lands on a Home placeholder; onboarding rejects taken usernames and invalid IANA timezones.
- *API:* `GET /api/me` returns 401 unauthenticated; `POST /api/me/onboarding` validates input and is idempotent (repeat with same data → 200, no duplicate rows); gameplay routes return `ONBOARDING_REQUIRED` before onboarding.
- *Database:* migration applies cleanly to an empty DB and is reversible in local; all MVP constraints exist (verified by an integration test that attempts each violation: duplicate username, two LIVE versions of one question, reviewer = author, `point_ledger` UPDATE/DELETE, correctness outside 0..1).
- *Content:* `pnpm content:import` imports the dev seed; running it twice changes nothing; importing a modified existing version fails with a clear error; audit rows are written.
- *Idempotency:* onboarding and content import are re-runnable.
- *Unit tests:* timezone validation, username rules, content hash, week-key function (incl. ISO year boundary 2026-12-31 / 2027-01-01).
- *Integration/E2E:* constraint tests above; Playwright: sign up → onboarding → Home.
- *Tooling:* `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` pass in CI; `db:reset` refuses to run outside local/test.
- *Migrations:* checked into `packages/db/migrations`.

#### Phase 1: Solo Quiz Loop, Points Ledger, Results Review
**Scope:** `quiz_solo` per §8.1 to §8.2, question selection per §11.6 (using default rating 1000 until Phase 3 writes ratings), session state machine §15.1, `computePoints()` per §10 with streak/friend/weakness/event multipliers fixed at 1.0, completion transaction §18.2 (steps 5 to 7 stubbed as no-ops behind interfaces), results screen with missed-question review, history page, expiry sweep.

**Prompt:**
> Implement Phase 1 only. Build the solo quiz loop (§8.1, §8.2) with the endpoints in §16.2, the session state machine (§15.1), question selection (§11.6), and `computePoints()` (§10) as a pure function in packages/core using decimal.js. Implement the completion transaction (§18.2) with streak, recommendation and improvement steps as no-op interfaces. Build the Quiz, Results (with missed-question review) and History screens. Add the `sessions/expire-stale` and `sessions/reconcile` Inngest jobs.

**Acceptance criteria**
- *User-visible:* a user can start, play and complete a 10-question quiz; sees per-question feedback; sees a points breakdown and a review of every missed question with its explanation; results survive a page reload; history lists the session.
- *API:*
  - Correct answers/answer keys never appear in `/next` or session-creation payloads (asserted by a test that scans responses for `answer_json` values).
  - Each answer is graded server-side; late answers beyond grace return `QUESTION_EXPIRED` and resolve as TIMEOUT.
  - A second open session returns `ACTIVE_SESSION_EXISTS`.
  - `/complete` before all questions are resolved returns `SESSION_NOT_FINISHED`.
  - Abandon/cancel follow §15.1; illegal actions return `INVALID_SESSION_STATE`.
- *Database:* a completed session has exactly 10 `answers`, 10 `learning_events`, 1 `point_ledger` row with a full breakdown, `users.total_points_cached` equals the ledger sum, status `COMPLETED` with `result_json`.
- *Idempotency:*
  - Retrying session creation with the same `Idempotency-Key` returns the same session.
  - Re-submitting an identical answer returns the stored result; a different response returns `ANSWER_ALREADY_SUBMITTED`; answer count stays 10.
  - Calling `/complete` repeatedly (sequentially and 5 concurrently) yields exactly one ledger row and identical responses.
- *Unit tests:* `computePoints()` covering fully correct, fully incorrect, timeout, partial correctness, speed-factor boundaries (0 ms left, full time left, grace window), combo build/reset/cap, each multiplier's boundaries, total multiplier cap (binding and non-binding), rounding (x.5 cases), and the §10.3 worked example; question selection ordering and seeded tie-breaks; session transition table.
- *Integration tests:* create → next → answer → complete; expiry sweep moves stale sessions to `EXPIRED`; reconcile re-sends missing post-processing events.
- *E2E:* Playwright: start quiz → answer all questions → complete → view results → reload → results persist.
- *Tooling:* lint, typecheck, unit, integration and relevant E2E tests pass.
- *Migrations:* any schema changes shipped as new migrations; no edits to Phase 0 migrations.

#### Phase 2: Streaks & Freezes
**Scope:** §12.1 in full: `streak_days`, freezes, `streak_summary`, display states, `streak_mult` wired into `computePoints()`, timezone change endpoint with cooldown and audit, Home streak UI, `admin:rebuild-streaks`.

**Prompt:**
> Implement Phase 2 only. Implement streak credit, freeze earning/consumption and display states exactly as specified in §12.1, inside step 5 of the completion transaction (§18.2). Wire `streak_mult` into computePoints. Add timezone changes with the 24 h cooldown and `user_timezone_changes` audit. Add the Home streak UI and the rebuild command.

**Acceptance criteria**
- *User-visible:* Home shows current streak and state (`ACTIVE_TODAY`, `AT_RISK`, `PROTECTED`, `BROKEN`), freezes held, and milestone celebration at 3/7/14/30/50/100/365.
- *API:* `GET /api/me` returns streak state computed at read time; `PATCH /api/me {timezone}` enforces the cooldown (`TIMEZONE_CHANGE_COOLDOWN`).
- *Database:* only qualifying completions create `PLAYED` rows; freeze consumption creates `FROZEN` rows and marks freezes `CONSUMED`; historical rows never change after a timezone change.
- *Idempotency:* two qualifying sessions on the same local date create one `streak_days` row; retrying `/complete` never double-credits; freeze grants are unique per earned date.
- *Unit tests:* consecutive days; same-day repeat; 1- and 2-day gaps with 0/1/2 freezes; gap larger than freezes (restart without consuming); freeze earned at 7/14 with cap 2; DST spring-forward and fall-back dates in `America/New_York` and `Australia/Melbourne`; completion near local midnight; timezone change mid-streak; `streak_mult` boundaries (0, 1, 30, 45 days).
- *Integration tests:* completion transaction applies streak credit; non-qualifying completion (< 50% answered) gives points but no streak; rebuild command reproduces `streak_summary`.
- *E2E:* play → streak 1; advance test clock one local day → play → streak 2.
- *Tooling / migrations:* as §25.

#### Phase 3: Deterministic Coach & Recommendations
**Scope:** §11.2 to §11.8: Elo updates in `coach/process-session` job with `skill_updates` audit, derived values at read time, weak/strength detection, lazy daily recommendation with seeded exploration, recommendation lifecycle §15.5, weakness tier snapshot and completion resolution, improvement bonus, Skills page, "Focus today" card, category tags, skill deltas on Results.

**Prompt:**
> Implement Phase 3 only. Implement the deterministic Coach (§11.2 to §11.8) as pure functions in packages/core/coach plus the `coach/process-session` Inngest job (§18.3). Implement lazy daily recommendations (§11.5) with the lifecycle in §15.5, weakness tier snapshots (§11.8), and the improvement bonus (§11.7), and wire `weakness_mult` into computePoints via steps 6 and 7 of the completion transaction. Build the Skills page, Focus card, category bonus tags and skill deltas on Results. No LLM.

**Acceptance criteria**
- *User-visible:* Skills page shows a radar with proficiency per launch category, strengths and weaknesses; Home shows today's recommendation with its bonus; category picker shows ×1.25/×1.5 tags; Results shows skill deltas after post-processing (with a pending state before).
- *API:* `GET /api/me/recommendation` returns the same recommendation all day (same local date) and a new one the next local date; sessions created with `recommendationId` get tier `RECOMMENDED`; the first qualifying completion shows `recommendationCompleted: true` and ×1.5; later sessions don't.
- *Database:* each learning event of a terminal session has exactly one `skill_updates` row; `skill_profiles.rating` equals the last `rating_after`; `recommendations.reason_json` contains the full input snapshot and seed.
- *Idempotency:* re-running `coach/process-session` for the same session changes nothing; concurrent `GET /api/me/recommendation` calls create one row; the recommendation bonus can't be granted twice (sequential and concurrent completions of two sessions from the same recommendation → exactly one `RECOMMENDED` award).
- *Unit tests:* Elo expected/update values, K switch at 50; proficiency clamp at both ends; confidence at 0/30/100 events; weakness score for fixture profiles (never-played = 0.50, strong-and-recent, weak-and-frequent, stale); weak/strength selection and slug tie-breaks; exploration triggered/not triggered for fixed seeds; target rating = rating − 147 and expected success ≈ 0.70 at that target; improvement bonus disabled below 3 sessions, triggered at exactly +0.10, not at +0.09; tier fallback rules.
- *Integration tests:* abandoned sessions update skills but give no points; expired recommendation falls back to `WEAK`/`NONE`; fixture users (§13.6) produce the expected recommendations.
- *E2E:* Home shows Focus card → start recommended quiz → complete → ×1.5 in breakdown → Skills page updates.
- *Tooling / migrations:* as §25.

**MVP release gate:** all ten items in §3.1 demonstrated by the E2E suite; §28 "Must decide before MVP build" items confirmed; Appendix A checked.

---

### Alpha

#### Phase 4: Global Weekly Leaderboard & Daily Challenge
**Scope:** §12.2 global board (Redis projection, Postgres canonical, rebuild, fallback), leaderboard screen, §8.5 daily challenge with `DAILY_CHALLENGE_BONUS` ledger rows.

**Acceptance criteria**
- *User-visible:* leaderboard shows the current UTC week's top 100 and the user's rank, with reset countdown; daily challenge card on Home, playable once for bonus per local date.
- *API:* `GET /api/leaderboards?scope=global&week=` works for current and past week keys; returns Postgres-fallback data when Redis is down (flag `degraded: true`).
- *Database:* week keys stored per ledger row; bonus ledger row idempotency key `daily:{challengeDate}:user:{userId}`.
- *Idempotency:* re-running projection jobs yields identical Redis scores; replaying the daily challenge grants normal points but no second bonus.
- *Unit tests:* week key boundaries; leaderboard ranking ties (equal scores share a rank, competition ranking 1, 2, 2, 4; display order among ties by username).
- *Integration tests:* Redis flushed → `rebuild-week` restores exact scores; Redis unavailable → completion still succeeds and ledger row exists.
- *E2E:* complete a quiz → appear on leaderboard; play daily challenge → bonus row shown in breakdown.

#### Phase 5: Mini-games & Dialogue Scenarios
**Scope:** `speed_math`, `memory_match` (adds the `memory` category), `dialogue_scenario` engine, versioned generator templates and scenario versions, 3 seeded scenarios, all emitting learning events via §9.

**Acceptance criteria**
- *User-visible:* each new mode is playable end-to-end with results and review.
- *API:* each mode uses the same session lifecycle and completion endpoint; no answer data leaks before grading.
- *Database:* every assessed item produces exactly one learning event with normalized correctness; mini-game items store template version + seed; scenario choices reference node ids.
- *Idempotency:* same guarantees as Phase 1 for each mode.
- *Unit tests:* scenario graph validation (reachable endings, no dangling nodes), scenario scoring, mini-game generators deterministic for a seed, memory correctness fraction.
- *Integration/E2E:* one Playwright journey per mode; Coach recommends `memory` for a user who has never played it.

#### Phase 6: Admin Publishing UI
**Scope:** §13.1 to §13.3 in a role-guarded admin UI: author drafts, review queue, approve/request changes, publish, archive, version diff, audit history.

**Acceptance criteria**
- *User-visible:* authors create/edit drafts; reviewers approve others' versions only; publishing a new version archives the old LIVE one.
- *API:* non-role users receive `FORBIDDEN`; every transition validated by the content state machine.
- *Database:* every transition writes `content_audit_log`; editing a non-draft version is impossible (creates a new version).
- *Idempotency:* double-clicking publish produces one LIVE version.
- *Unit tests:* content transition table; reviewer ≠ author rule.
- *Integration/E2E:* draft → review → approve → publish → appears in new sessions; archived version still renders in old results.

---

### Social Beta

#### Phase 7: Friends
**Scope:** §12.3 first-phase features: requests, accept/decline/cancel/remove, blocks, invite links, friends leaderboard.

**Acceptance criteria**
- *User-visible:* send/accept/decline/cancel/remove friends; block/unblock; friends tab on leaderboard.
- *API:* self-requests rejected; requests to/from blocked users rejected with `FORBIDDEN` (without revealing the block); rate limits enforced.
- *Database:* normalized pair constraint prevents (A,B)/(B,A) duplicates; block moves friendship to `REMOVED`.
- *Idempotency:* repeated request/accept calls converge to one row in one state.
- *Unit tests:* friendship transition table incl. 24 h re-request cooldown after `DECLINED`.
- *Integration/E2E:* two-browser Playwright test: A requests, B accepts, both appear on each other's friends leaderboard.

---

### Multiplayer Beta

#### Phase 8: Realtime Server & Co-op Consensus Quiz
**Scope:** `apps/realtime` (§17), lobbies (§15.2), match machine (§15.3), `quiz_coop` (§8.6), friend multiplier with anti-farming (§12.3), single results transaction (§17.5).

**Acceptance criteria**
- *User-visible:* create lobby → invite code → friends join → ready → play → shared results with individual breakdowns.
- *API/Realtime:* unauthenticated or wrong-lobby sockets are rejected; server deadlines authoritative; tie-break rule applied.
- *Database:* one results transaction per match writes all rows listed in §17.5; friend multiplier granted only when eligible; `friend_bonus_grants` enforces the daily pair cap.
- *Idempotency:* duplicate `clientEventId`s and reconnect replays never change votes, scores or rewards.
- *Unit tests:* consensus/tie-break, lobby and match transition tables, friend eligibility (age < 24 h, cap reached, blocked).
- *Realtime tests:* all §22.4 cases.
- *E2E:* 2-player co-op game via two Playwright contexts.

#### Phase 9: Team Deathmatch
**Scope:** §8.7 rules, weakness-weighted question pool, HP UI, post-match review.

**Acceptance criteria**
- *User-visible:* 2v2 match plays to completion with HP bars, round results, win/draw/loss and review.
- *Realtime:* damage computed once per round; simultaneous application; draw rules; disconnect → TIMEOUT rounds.
- *Database:* outcome in `match_results`; outcome bonus in each ledger breakdown.
- *Idempotency:* as Phase 8.
- *Unit tests:* damage formula, combo cap 5, self-damage, end conditions, draw, pool weighting probabilities for a fixed seed.
- *Realtime/E2E:* scripted 2v2 bot match (test-only bot clients) reaches the expected outcome deterministically.

---

### V1

#### Phase 10: LLM Coaching, Achievements, Event Multipliers
**Scope:** §11.9 narration (post-session + weekly) with template fallback; §12.4 achievements; admin-set event multipliers wired into `event_mult`.

**Acceptance criteria**
- *User-visible:* coach message appears on Results within seconds (or a template immediately if the LLM fails); weekly report; achievements page.
- *API/Jobs:* LLM calls only in jobs; gameplay endpoints make no LLM calls (asserted by test with the LLM client mocked to throw).
- *Database:* `coach_messages` unique per session/week; `user_achievements` unique; event multiplier stored in each affected ledger breakdown.
- *Idempotency:* re-running narration/achievement jobs creates nothing new.
- *Unit tests:* LLM output validation (length, no numbers that contradict the input snapshot), template selection, achievement criteria, overlapping event windows rejected.
- *Integration:* LLM outage → templated message and unchanged points/ratings.

#### Phase 11: Notifications, Feed, Privacy & Launch Hardening
**Scope:** opt-in web push (≤ 1/day, quiet hours), simple friend activity feed, data export and account deletion (§19.4), observability dashboards and alerts (§23), load test of `/complete`, public-launch checklist (§28).

**Acceptance criteria**
- *User-visible:* notification opt-in and settings; feed of friends' milestones; export download; account deletion with confirmation.
- *API:* export contains all of the user's canonical data; deletion anonymizes per §19.4 and signs the user out.
- *Database:* deleted users' canonical rows remain anonymized; aggregates unchanged.
- *Idempotency:* export and deletion requests are idempotent; no more than one reminder per local day (unique send log).
- *Tests:* integration tests for export/deletion; Playwright for opt-in flow; load test meets §23.3 targets.

---

## 25. Global Definition of Done

Applies to every phase in addition to its own criteria:
1. All phase acceptance criteria pass in CI.
2. `pnpm lint`, `pnpm typecheck` (strict), `pnpm test` (unit + integration) and relevant `pnpm test:e2e` suites pass.
3. All schema changes are new, checked-in migrations; earlier migrations are untouched.
4. Every new status field uses an enum with a transition table and exhaustive tests.
5. Every new write path that can be retried has a documented idempotency mechanism (added to §18.1 if new).
6. No System Invariant (§5) is violated.
7. New decisions and interpretations are recorded in `DECISIONS.md`.
8. No features from later phases were built beyond documented minimal interfaces.

---

## 26. Deferred Features

Not scheduled. They MUST NOT become architectural dependencies. Promoting one requires an ADR and a new phase with acceptance criteria.

| Feature | Notes / preconditions if promoted |
|---|---|
| Adaptive question-rating calibration | Minimum distinct users per version (e.g. 50), exclude flagged users, cap per-update change, version-aware, shadow-mode monitoring before affecting recommendations |
| Sub-topic skill profiles | `subtopic_profiles(user_id, category_id, sub_topic, rating, lifetime_event_count, last_event_at, updated_at)` fed by the same learning events; controlled sub-topic vocabulary first |
| Free-form LLM NPC dialogue | Rubric-based grading must remain deterministic or human-validated |
| AI-generated live questions | Only through §13.3 human review |
| Co-op relay/assist variant | |
| Friend streaks | |
| Friendship levels | |
| Leagues (promotion/demotion) | Needs rules for assignment, inactivity, ties, sizes, late joiners, snapshots |
| Regional / per-timezone leaderboards | |
| Teacher/classroom controls, organization tenancy | Consumer-first schema allows adding `organizations` referencing users |
| Guest play | Would need anonymous ids, expiry, migration and abuse limits |
| Advanced notification campaigns | |
| Horizontal realtime scaling | Socket.IO Redis adapter + sticky sessions |
| Monetization, cosmetics | |
| Native apps | |
| Additional categories (language, history…) | Requires a content pipeline per category |

---

## 27. Success Metrics & Analytics

### 27.1 Metric Definitions
| Metric | Definition |
|---|---|
| **Qualifying session** | See §6. |
| **Active user (DAU/WAU)** | User with ≥ 1 qualifying session in the UTC day / ISO week. |
| **D1 retention** | % of users who signed up on local day *D* and completed a qualifying session on local day *D+1*. |
| **D7 retention** | % of users who signed up on day *D* and completed a qualifying session on day *D+7* (exact day). |
| **D30 retention** | Same as D7 for day *D+30*. |
| **Rolling 7-day return** | % of new users with a qualifying session on any of days *D+1..D+7* (secondary). |
| **Recommendation completion rate** | Recommendations reaching `COMPLETED` ÷ recommendations generated (i.e. viewed at least once). |
| **Proficiency gain (30d)** | Per user-category with ≥ 20 learning events in the window: `proficiency(end) − proficiency(start)` from `skill_updates`. Report median. |
| **Weak-area accuracy trend** | Mean correctness on categories that were weak at the start of the window, week over week. |
| **Social session** | Completed session with ≥ 2 players who are accepted friends. |
| **Social share** | Social sessions ÷ all completed sessions. |
| **Point-source balance** | Share of `final_points − raw_base` attributable to each multiplier (log-decomposed from ledger breakdowns). No single source should exceed 50%. |
| **Median streak length** | Median `current_len` among WAU. |

Learning and points metrics are computed from **Postgres canonical tables**. Product analytics events are observational only.

### 27.2 Analytics Event Taxonomy (PostHog)
Snake_case, past tense, internal user id as `distinct_id`, no PII:
```
user_signed_up                 onboarding_completed
session_started                answer_submitted
session_completed              session_abandoned          session_expired
results_viewed                 review_item_expanded
recommendation_viewed          recommendation_started     recommendation_completed
skills_viewed                  streak_milestone_reached   streak_freeze_consumed
leaderboard_viewed             daily_challenge_completed
friend_request_sent            friend_request_accepted
multiplayer_lobby_created      multiplayer_lobby_joined   match_completed
coach_message_viewed           notification_opted_in
```
Analytics events MUST NOT be used as a source of truth for points, streaks or learning.

---

## 28. Open Product Decisions

### Must Decide Before MVP Build
| Decision | Status |
|---|---|
| Target age range | **[PROVISIONAL] 16+** |
| Launch subjects | **[PROVISIONAL] math, logic, science** |
| Canonical tech stack | **Decided** (§21.1) |
| Authentication vs guest play | **Decided: authentication required** |
| Timezone/leaderboard rule | **Decided: streaks = user local date; leaderboards = ISO week in UTC** |

### Must Decide Before Social Beta
- Friend discovery model (username search only vs invite links only vs both). *Current plan: both.*
- Safety and moderation requirements (reporting users, username filtering).
- Minimum age and social restrictions if the audience changes.

### Must Decide Before Public Launch
- Privacy policy and terms.
- Data export / deletion flow details (§19.4 baseline).
- Content licensing for all launch content.
- Regional compliance (e.g. GDPR, and child-privacy laws if under-16s are admitted).
- Notification consent wording and defaults.

### Can Remain Deferred
Monetization, teacher plans, organizations, leagues, cosmetics.

---

## 29. Agent Operating Instructions

Copy this block into every coding-agent session:

```text
Read PLANNING.md and DECISIONS.md fully before making changes.

Implement only the currently assigned build phase.

Do not pre-build later phases unless a minimal interface is required to avoid
a known architectural dead end. Record any such interface in DECISIONS.md.

Before coding:
1. identify affected modules
2. identify schema changes/migrations
3. identify system invariants (§5) that apply
4. identify the phase acceptance criteria (§24) and Definition of Done (§25)
5. identify the tests that must be added

Preserve all system invariants.
Use only the canonical stack in §21.1. Do not add libraries for concerns already covered.
Do not change canonical product rules (formulas, thresholds, state machines) to simplify implementation.
Keep domain logic pure in packages/core; no I/O there.
Never use wall-clock time or unseeded randomness in domain logic or tests.

After implementation:
1. run unit tests
2. run typecheck
3. run lint
4. run relevant integration tests
5. run relevant Playwright tests

Do not declare the phase complete unless all its acceptance criteria pass.

If the specification is ambiguous:
- choose the simplest implementation consistent with the documented invariants
- avoid speculative infrastructure
- record the decision in DECISIONS.md

Never silently invent a new product rule.
Do not revisit settled decisions in DECISIONS.md without recording a reason.
```

---

## Appendix A: Planning-Doc Quality Gate

- [x] One canonical stack (§21.1)
- [x] MVP scope explicit (§3.1)
- [x] Deferred features explicit (§26)
- [x] Every status has defined enum values (§15)
- [x] Transitions documented (§15)
- [x] Reward operations idempotent (§18.1)
- [x] Database constraints specified (§14.2)
- [x] Canonical sources of truth identified (§5, §18.4, §14.3)
- [x] Redis/cache failure cannot lose canonical progress (§18.4, §23.4)
- [x] LLM non-authoritative (§5.7, §11.9)
- [x] Content versioning exists (§13.2)
- [x] Learning events normalized (§9)
- [x] Elo difficulty math internally consistent (§11.6: 70% target → rating − 147)
- [x] Streak timezone rules explicit (§12.1)
- [x] Replay/abandonment rules explicit (§8.1, §8.2)
- [x] Each build phase has acceptance criteria (§24)
- [x] Testing requirements exist (§22)
- [x] Agent operating instructions exist (§29)
- [x] Architectural decisions recorded in `DECISIONS.md` (Appendix B)
- [ ] **Product owner has confirmed all [PROVISIONAL] items** (§2, §28)

---

## Appendix B: DECISIONS.md Format

`DECISIONS.md` lives at the repo root. The agent appends an ADR for every architectural choice and every non-trivial interpretation of this spec. Settled ADRs are not revisited without a new ADR that supersedes them.

```markdown
## ADR-NNN: <title>
- Status: Accepted | Provisional | Superseded by ADR-MMM
- Date: YYYY-MM-DD
- Phase: <phase>
- Context: <what forced the decision>
- Decision: <what was chosen>
- Consequences: <trade-offs, follow-ups>
```

The initial ADR set is provided in the accompanying `DECISIONS.md`.
