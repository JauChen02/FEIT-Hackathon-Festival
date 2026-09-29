# LearnArena: Implementation Prompts

Use one fresh agent session per phase. Every prompt follows the same pattern:
**plan → wait for approval → implement → prove acceptance criteria.**

Order:
1. Phase 1, Phase 2, Phase 3 (MVP)
2. MVP Release Gate
3. **Stitch Design Pass** (restyles the MVP screens)
4. Phase 4, Phase 5, Phase 6 (Alpha)
5. Phase 7 (Social Beta)
6. Phase 8, Phase 9 (Multiplayer Beta)
7. Phase 10, Phase 11 (V1)

Utility prompts (approve, fix, resume) are at the bottom.

---

## Phase 1: Solo Quiz Loop, Points Ledger, Results Review

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 1: Solo Quiz Loop, Points Ledger, Results Review (PLANNING.md §24).
Phase 0 is complete. Implement ONLY Phase 1. Follow the Agent Operating Instructions in §29.

Relevant sections: §8.1, §8.2, §9, §10, §11.6, §15.1, §16, §18.1, §18.2, §18.3, §20 (screens 3, 5, 6, 8).

Key rules to respect:
- Questions are served one at a time; answer keys never appear in any payload before grading.
- computePoints() is a pure function in packages/core using decimal.js, with the exact
  order of operations in §10.2. Streak, friend, weakness and event multipliers are fixed
  at 1.0 in this phase.
- Question selection uses §11.6 with a default user rating of 1000 (skill ratings arrive in Phase 3).
- The completion transaction follows §18.2. Steps 5 (streak), 6 (recommendation) and
  7 (improvement bonus) are no-op interfaces that later phases will fill in.
- Add the Inngest jobs sessions/expire-stale and sessions/reconcile, and send
  session/terminal after commit with a deterministic event id.

STEP 1: PLAN ONLY (no code yet)
Reply with:
1. Files/modules you will create or change.
2. Schema changes and new migrations (if any).
3. Invariants from §5 that apply and how you'll enforce each.
4. The endpoint-by-endpoint behavior, including every error code from §16.1 you'll return.
5. The Phase 1 acceptance criteria mapped to specific tests, including the concurrency
   test for 5 parallel /complete calls.
6. Ambiguities found, with the simplest option you propose for each.
Then STOP and wait for my approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 1 scope.
- UI constraint (ADR-021) still applies: default shadcn/ui, theme tokens only,
  presentational components in components/ui-app/ with no data logic,
  loading/empty/error states on every screen.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a checklist of every Phase 1 acceptance criterion marked pass/fail,
  naming the test that proves each one.
```

---

## Phase 2: Streaks & Freezes

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 2: Streaks & Freezes (PLANNING.md §24).
Phases 0 to 1 are complete. Implement ONLY Phase 2. Follow §29.

Relevant sections: §6 (qualifying session), §10.1 (streak_mult), §12.1, §14.2 (streak tables),
§15.6, §16.1, §18.2 step 5, §22.1, §22.5.

Key rules to respect:
- Streak credit happens inside step 5 of the existing completion transaction, only for
  qualifying sessions.
- local_date is computed at completion time from the user's IANA timezone using @date-fns/tz.
- No midnight cron. Streak length and display state (ACTIVE_TODAY, AT_RISK, PROTECTED,
  BROKEN) are derived at read time from streak_days.
- Freezes: earned at each multiple of 7 (max 2 held), consumed lazily at the next qualifying
  completion, oldest first. If the gap exceeds available freezes, the streak restarts and
  no freezes are consumed.
- Timezone changes: one per 24 h, logged in user_timezone_changes, never rewrite history.
- All date logic uses the injectable Clock; tests must never use wall-clock time.

STEP 1: PLAN ONLY (no code yet)
Reply with:
1. Files/modules to create or change (keep streak logic pure in packages/core/streaks).
2. Schema changes and migrations.
3. The streak credit algorithm as pseudocode, step by step, matching §12.1.
4. The full list of DST and edge-case unit tests you will write (dates and timezones).
5. The Phase 2 acceptance criteria mapped to tests.
6. Ambiguities and your proposed resolutions.
Then STOP and wait for my approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 2 scope, including the admin:rebuild-streaks command and
  the Home streak UI (ADR-021 UI constraint still applies).
- Wire streak_mult into computePoints and extend its unit tests.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 2 acceptance criterion with its test.
```

---

## Phase 3: Deterministic Coach & Recommendations

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 3: Deterministic Coach & Recommendations (PLANNING.md §24).
Phases 0 to 2 are complete. Implement ONLY Phase 3. Follow §29.

Relevant sections: §9, §11.1 to §11.8, §14.2 (skill_profiles, skill_updates, recommendations),
§15.5, §18.1, §18.2 steps 6 and 7, §18.3, §20 (screens 3, 4, 6, 7), §13.6 (fixture users).

Key rules to respect:
- The Coach reads ONLY learning_events, never game-specific tables.
- Elo updates run in the coach/process-session Inngest job (concurrency key = user_id),
  applied in occurred_at order, one skill_updates row per learning event (UNIQUE guard).
- proficiency, confidence and weakness_score are derived at read time, never stored.
- Recommendations are generated lazily on the first GET of the user's local date, with
  exploration seeded by hash(user_id, local_date). Store the full input snapshot in reason_json.
- weakness_tier is snapshotted at session creation (§11.8) and resolved at completion.
- The recommendation bonus (×1.5) can only be granted once; abandoning does not consume it.
- Improvement bonus per §11.7 exactly (≥ 3 prior qualifying sessions, +0.10 threshold).
- No LLM anywhere in this phase.

STEP 1: PLAN ONLY (no code yet)
Reply with:
1. Files/modules to create or change (pure logic in packages/core/coach).
2. Schema changes and migrations.
3. The fixture users you'll add and the exact recommendation you expect for each.
4. How you'll guarantee the recommendation bonus is granted once under concurrent completions.
5. The Phase 3 acceptance criteria mapped to tests, including the numeric unit-test cases
   (Elo, K switch at 50, never-played weakness = 0.50, target rating − 147 ≈ 70%).
6. Ambiguities and your proposed resolutions.
Then STOP and wait for my approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 3 scope: Skills page with radar chart, Focus card on Home,
  category bonus tags, skill deltas on Results (with a pending state).
  ADR-021 UI constraint still applies.
- Wire weakness_mult into computePoints and extend its unit tests.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 3 acceptance criterion with its test.
```

---

## MVP Release Gate

```text
Read PLANNING.md and DECISIONS.md fully.

Phases 0 to 3 are complete. Do NOT build new features. Perform the MVP release gate audit:

1. For each of the 10 items in §3.1, show which E2E test demonstrates it. If any is
   missing, write that test.
2. For each System Invariant in §5 that applies to the MVP, explain how the code enforces
   it and name the test that proves it. Flag any invariant without a test.
3. Verify every idempotency mechanism in §18.1 that applies to MVP exists in code and
   has an integration test.
4. Run the cache rebuild commands (§14.3) against the seeded dev DB and confirm zero drift.
5. Check Appendix A items and report any that don't hold in the actual code.
6. List every DECISIONS.md entry added during Phases 0 to 3 and flag any that
   contradict PLANNING.md.
7. Run the full test suite, lint and typecheck.

Output a gate report: PASS/FAIL per item, plus a prioritized list of fixes.
Fix only defects (not new features), then re-run and report again.
```

---

## Stitch Design Pass (after the MVP gate)

```text
Read PLANNING.md and DECISIONS.md fully, especially ADR-021 and §20.

We are doing the visual design pass for the MVP screens using the Google Stitch MCP.
Do NOT change any API, database, domain logic, hooks or data-fetching code.

Screens in scope (§20): 1 Sign up/in, 2 Onboarding, 3 Home, 4 Category picker,
5 Quiz, 6 Results, 7 Skills, 8 History, 9 Settings.

STEP 1: PLAN ONLY
1. List the Stitch MCP tools available to you and how you'll use them to obtain the designs.
2. For each screen, list the presentational components in components/ui-app/ that will be
   restyled and the props they already receive. Confirm no prop contracts need to change;
   if one must change, explain why.
3. Propose the design tokens (colors, typography, radii, spacing, shadows, motion) you'll
   extract from the Stitch designs into the single theme file, including dark mode.
4. List any design elements that would require new data from the API. Do NOT implement
   them; list them as follow-ups.
Then STOP and wait for my approval.

STEP 2: AFTER APPROVAL
- Import/translate the Stitch designs into the presentational components only.
- Put all tokens in the theme file; no hardcoded values in components.
- Add Framer Motion only for the interactions shown in the designs (points breakdown,
  streak flame, answer feedback), respecting prefers-reduced-motion.
- Keep loading, empty and error states, restyled to match.
- Check mobile (390 px) and desktop layouts, keyboard navigation, visible focus states,
  and WCAG AA contrast.
- Add ADR-022 to DECISIONS.md: "Design system established from Stitch; later screens must
  use its tokens and components."
- Run all existing tests; E2E selectors must still pass (use data-testid, not styling classes).
- Finish with before/after screenshots per screen (Playwright) and the follow-up list.
```

---

## Phase 4: Global Weekly Leaderboard & Daily Challenge (Alpha)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 4: Global Weekly Leaderboard & Daily Challenge (PLANNING.md §24).
The MVP and the Stitch design pass are complete. Implement ONLY Phase 4. Follow §29.

Relevant sections: §8.5, §12.2, §14.2 (daily_challenges tables, point_ledger), §14.3,
§16.2 (Alpha endpoints), §18.1, §18.3, §18.4, §23.4 (Redis unavailable).

Key rules to respect:
- Postgres point_ledger is canonical; Redis sorted sets are projections.
- Keys are leaderboard:{YYYY-Www}:global in UTC; never reset or delete a current week.
- Projection writes use absolute ZADD of the recomputed weekly sum, never ZINCRBY.
- Redis down: completion still succeeds; leaderboard falls back to Postgres with degraded: true.
- Daily challenge bonus: one DAILY_CHALLENGE_BONUS ledger row per user per challenge date
  (idempotency key daily:{challengeDate}:user:{userId}); replays earn normal points only.
- UI: follow the Stitch design system (ADR-022); new screens use existing tokens/components.

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, job designs (leaderboard/project-user,
leaderboard/rebuild-week), the Redis-failure behavior, the Phase 4 acceptance criteria
mapped to tests, and ambiguities with proposed resolutions. Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 4 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 4 acceptance criterion with its test.
```

---

## Phase 5: Mini-games & Dialogue Scenarios (Alpha)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 5: Mini-games & Dialogue Scenarios (PLANNING.md §24).
Phases 0 to 4 are complete. Implement ONLY Phase 5. Follow §29.

Relevant sections: §2.1 (memory category), §8.3, §8.4, §9, §10, §13.2 (scenario and
generator template versioning), §15.1, §18.1.

Key rules to respect:
- speed_math, memory_match and dialogue_scenario all use the existing session lifecycle,
  completion transaction and ledger. Do not create parallel reward paths.
- Every assessed item emits exactly one normalized learning event via
  learning/recordEvent.ts, with correctness normalized to 0..1.
- Mini-game items store template version + seed so they're reproducible.
- Scenarios are versioned JSON graphs, validated on import (reachable endings,
  no dangling nodes), untimed (speed_factor 1.0), no combo, +50 for best_ending.
- Add the memory category and link it to memory_match via game_type_categories.
- Seed 3 reviewed scenarios through the content import pipeline.
- UI: follow the Stitch design system (ADR-022).

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, how each mode maps to the learning-event contract
(§9) with sourceKey choices, scenario graph JSON schema, generator template design,
the Phase 5 acceptance criteria mapped to tests, and ambiguities with proposed resolutions.
Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 5 scope.
- Confirm the Coach recommends memory for a fixture user who has never played it.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 5 acceptance criterion with its test.
```

---

## Phase 6: Admin Publishing UI (Alpha)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 6: Admin Publishing UI (PLANNING.md §24).
Phases 0 to 5 are complete. Implement ONLY Phase 6. Follow §29.

Relevant sections: §13.1 to §13.5, §15.7, §14.2 (content tables, content_audit_log,
admin_audit_log), §19.1 (admin authorization).

Key rules to respect:
- Roles AUTHOR, REVIEWER, ADMIN; a reviewer can never approve their own version.
- Assessment-critical fields are immutable once a version leaves DRAFT; edits create a
  new version.
- Publishing a new version archives the previous LIVE version in the same transaction.
- AI_GENERATED content can never reach LIVE without human REVIEWER approval.
- Every transition writes content_audit_log; every admin action writes admin_audit_log.
- Non-role users get FORBIDDEN on every admin route (server-side checks, not just hidden UI).
- UI: follow the Stitch design system (ADR-022). Include a version diff view.

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, the admin route list with required roles,
the transition guard design, the Phase 6 acceptance criteria mapped to tests, and
ambiguities with proposed resolutions. Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 6 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 6 acceptance criterion with its test.
```

---

## Phase 7: Friends (Social Beta)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 7: Friends (PLANNING.md §24).
Alpha (Phases 0 to 6) is complete. Implement ONLY Phase 7. Follow §29.
Before starting, confirm with me the "Must Decide Before Social Beta" items in §28.

Relevant sections: §12.2 (friends board), §12.3, §14.2 (friendships, user_blocks,
invite_links), §15.4, §16.2 (Social Beta endpoints), §19.2 (rate limits).

Key rules to respect:
- Normalized friendship pairs: user_low_id < user_high_id, UNIQUE pair.
- Blocking removes the friendship, blocks requests both ways, and must not reveal to the
  blocked user that they are blocked (return generic FORBIDDEN).
- 24 h re-request cooldown after DECLINED.
- Friends leaderboard reads the global week set with ZMSCORE for friend ids + self,
  with a Postgres fallback.
- Friendship levels, friend streaks and activity feeds are NOT in scope.
- UI: follow the Stitch design system (ADR-022).

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, the transition table implementation, rate limit
settings, invite link design, the Phase 7 acceptance criteria mapped to tests, and
ambiguities with proposed resolutions. Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 7 scope, including the two-browser Playwright test.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 7 acceptance criterion with its test.
```

---

## Phase 8: Realtime Server & Co-op Consensus Quiz (Multiplayer Beta)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 8: Realtime Server & Co-op Consensus Quiz (PLANNING.md §24).
Phases 0 to 7 are complete. Implement ONLY Phase 8. Follow §29.

Relevant sections: §5 (invariants 1, 8, 10, 13), §8.6, §10.1 (friend_mult), §12.3
(eligibility and anti-farming), §14.2 (lobbies, lobby_members, match_results,
friend_bonus_grants), §15.2, §15.3, §17 (all), §18.1, §22.4, §23.4.

Key rules to respect:
- apps/realtime is a separate Socket.IO service on Railway and is authoritative.
- It imports scoring and transition logic from packages/core. Do not duplicate
  computePoints or state machines.
- Signed handshake tokens (2 min), signed reconnect tokens (30 s window), per-socket
  rate limits, Zod validation of every event.
- Dedupe by clientEventId; one vote per player per question; scores computed once per round.
- No DB writes per transient event. One results transaction at FINALIZING writes every
  row listed in §17.5. Crash = ABORTED, session CANCELLED, no rewards (ADR-018).
- Friend multiplier only when eligible (§12.3), enforced via friend_bonus_grants.
- Single realtime instance; no Redis adapter.
- UI: follow the Stitch design system (ADR-022) for lobby and match screens.

STEP 1: PLAN ONLY (no code yet)
Reply with: service structure, the in-memory match state shape, the event handling flow
for each client event, the reconnect design, the results transaction contents, how
co-op points map onto computePoints, the Phase 8 acceptance criteria mapped to tests
(including every §22.4 realtime case), and ambiguities with proposed resolutions.
Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 8 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration, realtime and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 8 acceptance criterion with its test.
```

---

## Phase 9: Team Deathmatch (Multiplayer Beta)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 9: Team Deathmatch (PLANNING.md §24).
Phases 0 to 8 are complete. Implement ONLY Phase 9. Follow §29.

Relevant sections: §8.7, §10 (outcome bonus, weakness_mult = 1.0 in multiplayer, ADR-017),
§11.4 (weakness scores for pool weighting), §15.3, §17, §22.4.

Key rules to respect:
- Reuse the Phase 8 realtime infrastructure, lobby and match state machines.
- Damage formula, combo cap 5, 3 self-damage on wrong answers, 0 on timeout,
  simultaneous application at round end, 100 HP, max 15 rounds, draw rules: exactly §8.7.
- Question pool weighted by combined player weakness (probability ∝ 0.2 + weakness_score),
  seeded by session id.
- Mandatory post-match review of every question the player's team missed.
- Test-only bot clients for deterministic scripted matches; bots must not exist in production builds.
- UI: follow the Stitch design system (ADR-022). HP bars, round results, outcome screen.

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, round resolution pseudocode, pool weighting
implementation, bot client design, the Phase 9 acceptance criteria mapped to tests,
and ambiguities with proposed resolutions. Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 9 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration, realtime and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 9 acceptance criterion with its test.
```

---

## Phase 10: LLM Coaching, Achievements, Event Multipliers (V1)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 10: LLM Coaching, Achievements, Event Multipliers (PLANNING.md §24).
Phases 0 to 9 are complete. Implement ONLY Phase 10. Follow §29.

Relevant sections: §5 (invariant 7), §10.1 (event_mult), §11.9, §12.4, §14.2 (coach_messages,
achievements, user_achievements, event_multipliers), §18.3, §19.4 (LLM input retention),
§23.4 (LLM unavailable).

Key rules to respect:
- The LLM is narration only. It never touches points, ratings, streaks, achievements,
  leaderboards, match outcomes or content publication.
- LLM calls happen only in Inngest jobs (coach/narrate-session, weekly report), never in
  request handlers. Gameplay must be unaffected if the LLM is down.
- Input is the structured snapshot in §11.9 (no PII beyond display_name); store it in
  input_snapshot_json; null it after 90 days.
- Validate output (≤ 400 chars, 2 to 3 sentences + 1 tip, no numbers contradicting the
  snapshot); on failure or invalid output, use the template fallback.
- Use the Anthropic Claude API server-side only; key never reaches the client.
- Achievements are evaluated by a post-commit job; grants unique per (user, achievement).
- Event multipliers: admin-created, non-overlapping windows, stored in each affected
  ledger breakdown.
- UI: follow the Stitch design system (ADR-022).

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, the system prompt you'll send to the LLM,
output validation rules, template fallback set, achievement criteria implementation,
the Phase 10 acceptance criteria mapped to tests (including the test that gameplay
endpoints make zero LLM calls), and ambiguities with proposed resolutions.
Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 10 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests; fix failures.
- Finish with a pass/fail checklist of every Phase 10 acceptance criterion with its test.
```

---

## Phase 11: Notifications, Feed, Privacy & Launch Hardening (V1)

```text
Read PLANNING.md and DECISIONS.md fully before doing anything.

We are starting Phase 11: Notifications, Feed, Privacy & Launch Hardening (PLANNING.md §24).
Phases 0 to 10 are complete. Implement ONLY Phase 11. Follow §29.
Before starting, confirm with me the "Must Decide Before Public Launch" items in §28.

Relevant sections: §12.5 (guardrails), §14.2 (push_subscriptions, notification_preferences,
activity_events), §19 (all), §23 (all), §27.

Key rules to respect:
- Push notifications are opt-in, at most 1 reminder per user local day, respect quiet
  hours; enforce with a unique send log.
- Activity feed: simple friend milestones only, UNIQUE(actor_id, kind, ref_id),
  hidden across blocks.
- Data export: JSON of all the user's canonical data.
- Account deletion: anonymize per §19.4 (keep anonymized canonical rows so aggregates
  and other players' histories stay consistent), remove the auth user, sign out.
- Observability: dashboards and alerts for every metric in §23.2; confirm every log
  event in §23.1 exists; confirm no PII in logs.
- Load test /complete and standard endpoints against §23.3 targets.
- Verify every analytics event in §27.2 fires with no PII.
- UI: follow the Stitch design system (ADR-022).

STEP 1: PLAN ONLY (no code yet)
Reply with: files to change, migrations, the export format, the deletion/anonymization
field-by-field plan, notification scheduling design, load test plan, the Phase 11
acceptance criteria mapped to tests, and ambiguities with proposed resolutions.
Then STOP and wait for approval.

STEP 2: AFTER APPROVAL, IMPLEMENT
- Build everything in Phase 11 scope.
- Record new decisions in DECISIONS.md.
- Run lint, typecheck, unit, integration and E2E tests plus the load test; fix failures.
- Finish with a pass/fail checklist of every Phase 11 acceptance criterion with its test,
  and a public-launch readiness report covering every §28 "Before Public Launch" item.
```

---

## Utility Prompts

### Approve a plan
```text
Plan approved, with these changes: <list changes or "none">.
Proceed to Step 2. Record the resolved ambiguities as ADRs in DECISIONS.md.
```

### Tests failing / agent stuck
```text
Stop adding features. List every failing test and lint/typecheck error with its root cause.
Fix them one at a time, re-running the relevant suite after each fix.
Do not change product rules, formulas or acceptance criteria to make tests pass.
If a test itself contradicts PLANNING.md, show me the conflict and wait.
```

### Resume in a new session mid-phase
```text
Read PLANNING.md and DECISIONS.md fully. We are partway through Phase <N>.
Inspect the repo and git log, then report:
1. which Phase <N> acceptance criteria already pass (run the tests to confirm),
2. what remains,
3. any code that contradicts PLANNING.md.
Then STOP and wait for my go-ahead before continuing.
```

### Agent wants to change a settled rule
```text
Don't change it in code. Write a proposed ADR in DECISIONS.md with status "Proposed"
explaining the problem, the options, and your recommendation, then wait for my decision.
```
