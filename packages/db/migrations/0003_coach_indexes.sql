-- Phase 3 read paths (PLANNING.md §11.5, §11.7).
--
-- Both are additive partial indexes; no table, column or type is altered, so
-- §14.4's ban on destructive production migrations is satisfied and the
-- Phase 0 migrations are untouched.

-- §11.7: "the most recent 5 prior qualifying sessions in the same category".
-- Run once per completion, inside the §18.2 transaction, so it should not have
-- to scan a learner's whole history.
CREATE INDEX game_sessions_improvement_idx
  ON game_sessions (owner_id, category_id, ended_at DESC)
  WHERE status = 'COMPLETED' AND is_qualifying;
--> statement-breakpoint

-- §15.5: recommendations from past local dates are expired lazily on the next
-- read. This index keeps that check to the handful of rows that can still be
-- open, rather than every recommendation the learner has ever had.
CREATE INDEX recommendations_open_idx
  ON recommendations (user_id, local_date)
  WHERE status IN ('AVAILABLE', 'IN_PROGRESS');
