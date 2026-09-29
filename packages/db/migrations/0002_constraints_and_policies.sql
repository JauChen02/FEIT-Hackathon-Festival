-- Constraints and policies that Drizzle's schema DSL cannot express
-- (PLANNING.md §14.1, §14.2).
--
-- 1. point_ledger append-only enforcement (Invariant 3, ADR-006)
-- 2. Row Level Security: deny-all for anon and authenticated (§14.1)

-- ---------------------------------------------------------------------------
-- 1. point_ledger is append-only
-- ---------------------------------------------------------------------------
-- §14.2: "Append-only: UPDATE/DELETE revoked for the app role + trigger that
-- raises on UPDATE/DELETE."
--
-- The trigger is the real enforcement, and the REVOKE below is defence in
-- depth. That ordering matters: the application connects as the table owner,
-- and a GRANT-based rule would not bind an owner or a superuser at all, whereas
-- a trigger binds every role. Corrections are new ADJUSTMENT rows (§10.4).

CREATE OR REPLACE FUNCTION point_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'point_ledger is append-only; attempted % (PLANNING.md Invariant 3). Write an ADJUSTMENT row instead.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER point_ledger_no_update
  BEFORE UPDATE ON point_ledger
  FOR EACH ROW EXECUTE FUNCTION point_ledger_append_only();
--> statement-breakpoint

CREATE TRIGGER point_ledger_no_delete
  BEFORE DELETE ON point_ledger
  FOR EACH ROW EXECUTE FUNCTION point_ledger_append_only();
--> statement-breakpoint

-- Revoke write access from the PostgREST-facing roles where they exist. On a
-- plain Postgres (CI, a local container) these roles are absent, so the
-- statement is wrapped rather than allowed to abort the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE, DELETE ON point_ledger FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE, DELETE ON point_ledger FROM authenticated;
  END IF;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Row Level Security: deny-all
-- ---------------------------------------------------------------------------
-- §14.1: "The browser never talks to Postgres directly. Row Level Security is
-- enabled with deny-all for the anon and authenticated roles; the server
-- connects with a privileged role."
--
-- RLS is enabled with **no policies at all**, which denies every row to every
-- non-owner role. The application connects as the table owner over
-- DATABASE_URL and is unaffected (owners bypass RLS unless FORCE ROW LEVEL
-- SECURITY is set, which we deliberately do not set).

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE user_roles             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE user_timezone_changes  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE categories             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE game_types             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE game_type_categories   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE questions              ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE question_versions      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_audit_log      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE game_sessions          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE session_players        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE session_questions      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE answers                ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE learning_events        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE skill_profiles         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE skill_updates          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE recommendations        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE point_ledger           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE streak_days            ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE streak_freezes         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE streak_summary         ENABLE ROW LEVEL SECURITY;
