CREATE TYPE "public"."answer_outcome" AS ENUM('ANSWERED', 'TIMEOUT');--> statement-breakpoint
CREATE TYPE "public"."category_status" AS ENUM('LAUNCH', 'ACTIVE', 'DEFERRED');--> statement-breakpoint
CREATE TYPE "public"."content_origin" AS ENUM('HUMAN', 'AI_GENERATED', 'DEV_SEED');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'LIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."freeze_status" AS ENUM('AVAILABLE', 'CONSUMED');--> statement-breakpoint
CREATE TYPE "public"."game_mode" AS ENUM('SOLO', 'COOP', 'VERSUS');--> statement-breakpoint
CREATE TYPE "public"."game_type_status" AS ENUM('ENABLED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('SESSION_COMPLETION', 'DAILY_CHALLENGE_BONUS', 'ACHIEVEMENT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('MCQ', 'NUMERIC');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('CREATED', 'ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."streak_day_source" AS ENUM('PLAYED', 'FROZEN');--> statement-breakpoint
CREATE TYPE "public"."team_side" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('AUTHOR', 'REVIEWER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."weakness_tier" AS ENUM('NONE', 'WEAK', 'RECOMMENDED');--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user_timezone_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"old_tz" text NOT NULL,
	"new_tz" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"total_points_cached" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_username_length" CHECK (length("users"."username") between 3 and 20),
	CONSTRAINT "users_username_charset" CHECK (("users"."username")::text ~ '^[a-z0-9_]+$'),
	CONSTRAINT "users_timezone_not_blank" CHECK (length(btrim("users"."timezone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"status" "category_status" NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "game_type_categories" (
	"game_type_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "game_type_categories_game_type_id_category_id_pk" PRIMARY KEY("game_type_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "game_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"mode" "game_mode" NOT NULL,
	"status" "game_type_status" NOT NULL,
	CONSTRAINT "game_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "content_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "content_status" NOT NULL,
	"origin" "content_origin" NOT NULL,
	"type" "question_type" NOT NULL,
	"category_id" uuid NOT NULL,
	"sub_topic" text,
	"prompt" text NOT NULL,
	"options_json" jsonb,
	"answer_json" jsonb,
	"explanation" text NOT NULL,
	"difficulty" smallint NOT NULL,
	"rating" numeric(7, 2) NOT NULL,
	"source" text,
	"license" text,
	"content_hash" text NOT NULL,
	"author_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_versions_question_version_unique" UNIQUE("question_id","version_number"),
	CONSTRAINT "question_versions_difficulty_range" CHECK ("question_versions"."difficulty" between 1 and 5),
	CONSTRAINT "question_versions_reviewer_not_author" CHECK ("question_versions"."reviewed_by" is null or "question_versions"."reviewed_by" <> "question_versions"."author_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "questions_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"outcome" "answer_outcome" NOT NULL,
	"response_json" jsonb,
	"correctness" numeric(4, 3) NOT NULL,
	"speed_factor" numeric(5, 4) NOT NULL,
	"response_time_ms" integer,
	"server_received_at" timestamp with time zone NOT NULL,
	"client_sent_at" timestamp with time zone,
	CONSTRAINT "answers_session_user_version_unique" UNIQUE("session_id","user_id","question_version_id"),
	CONSTRAINT "answers_correctness_range" CHECK ("answers"."correctness" between 0 and 1),
	CONSTRAINT "answers_speed_factor_range" CHECK ("answers"."speed_factor" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_type_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"category_id" uuid,
	"owner_id" uuid NOT NULL,
	"status" "session_status" NOT NULL,
	"weakness_tier" "weakness_tier" NOT NULL,
	"weakness_snapshot_json" jsonb NOT NULL,
	"recommendation_id" uuid,
	"daily_challenge_id" uuid,
	"question_count" smallint,
	"time_limit_ms" integer,
	"creation_idempotency_key" uuid NOT NULL,
	"local_date" date,
	"is_qualifying" boolean,
	"result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"post_processed_at" timestamp with time zone,
	CONSTRAINT "game_sessions_owner_idempotency_unique" UNIQUE("owner_id","creation_idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"game_type_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"question_version_id" uuid,
	"answer_id" uuid,
	"category_id" uuid NOT NULL,
	"sub_topic" text,
	"difficulty_rating" numeric(7, 2) NOT NULL,
	"correctness" numeric(4, 3) NOT NULL,
	"timed_out" boolean NOT NULL,
	"response_time_ms" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_events_answer_id_unique" UNIQUE("answer_id"),
	CONSTRAINT "learning_events_session_user_source_unique" UNIQUE("session_id","user_id","source_key"),
	CONSTRAINT "learning_events_correctness_range" CHECK ("learning_events"."correctness" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "session_players" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"team" "team_side",
	"placement" smallint,
	CONSTRAINT "session_players_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"session_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"question_version_id" uuid NOT NULL,
	"served_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	CONSTRAINT "session_questions_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "session_questions_session_version_unique" UNIQUE("session_id","question_version_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"game_type_id" uuid NOT NULL,
	"target_rating" numeric(7, 2) NOT NULL,
	"status" "recommendation_status" NOT NULL,
	"reason_json" jsonb NOT NULL,
	"completed_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	CONSTRAINT "recommendations_completed_session_id_unique" UNIQUE("completed_session_id"),
	CONSTRAINT "recommendations_user_local_date_unique" UNIQUE("user_id","local_date")
);
--> statement-breakpoint
CREATE TABLE "skill_profiles" (
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"rating" numeric(7, 2) DEFAULT '1000' NOT NULL,
	"lifetime_event_count" integer DEFAULT 0 NOT NULL,
	"last_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_profiles_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "skill_updates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learning_event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"rating_before" numeric(7, 2) NOT NULL,
	"rating_after" numeric(7, 2) NOT NULL,
	"expected" numeric(6, 5) NOT NULL,
	"k_factor" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_updates_learning_event_id_unique" UNIQUE("learning_event_id")
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"reason" "ledger_reason" NOT NULL,
	"raw_base_points" numeric(12, 4) NOT NULL,
	"combo_adjusted_points" numeric(12, 4) NOT NULL,
	"multipliers_json" jsonb NOT NULL,
	"uncapped_points" numeric(12, 4) NOT NULL,
	"cap_applied" boolean NOT NULL,
	"final_points" integer NOT NULL,
	"week_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"adjusts_ledger_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "point_ledger_week_key_format" CHECK ("point_ledger"."week_key" ~ '^\d{4}-W\d{2}$'),
	CONSTRAINT "point_ledger_adjustment_target" CHECK (("point_ledger"."reason" = 'ADJUSTMENT') = ("point_ledger"."adjusts_ledger_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "streak_days" (
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"source" "streak_day_source" NOT NULL,
	"session_id" uuid,
	"freeze_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_days_user_id_local_date_pk" PRIMARY KEY("user_id","local_date")
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "freeze_status" NOT NULL,
	"earned_on_local_date" date NOT NULL,
	"consumed_for_local_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "streak_freezes_user_earned_unique" UNIQUE("user_id","earned_on_local_date"),
	CONSTRAINT "streak_freezes_user_consumed_unique" UNIQUE("user_id","consumed_for_local_date")
);
--> statement-breakpoint
CREATE TABLE "streak_summary" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_len" integer DEFAULT 0 NOT NULL,
	"longest_len" integer DEFAULT 0 NOT NULL,
	"last_local_date" date,
	"freezes_available" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timezone_changes" ADD CONSTRAINT "user_timezone_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_type_categories" ADD CONSTRAINT "game_type_categories_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_type_categories" ADD CONSTRAINT "game_type_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audit_log" ADD CONSTRAINT "content_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_game_type_id_game_types_id_fk" FOREIGN KEY ("game_type_id") REFERENCES "public"."game_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_completed_session_id_game_sessions_id_fk" FOREIGN KEY ("completed_session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_updates" ADD CONSTRAINT "skill_updates_learning_event_id_learning_events_id_fk" FOREIGN KEY ("learning_event_id") REFERENCES "public"."learning_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_updates" ADD CONSTRAINT "skill_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_updates" ADD CONSTRAINT "skill_updates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_adjusts_ledger_id_point_ledger_id_fk" FOREIGN KEY ("adjusts_ledger_id") REFERENCES "public"."point_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_days" ADD CONSTRAINT "streak_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_days" ADD CONSTRAINT "streak_days_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_summary" ADD CONSTRAINT "streak_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_timezone_changes_user_idx" ON "user_timezone_changes" USING btree ("user_id","changed_at");--> statement-breakpoint
CREATE INDEX "content_audit_log_entity_idx" ON "content_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_version" ON "question_versions" USING btree ("question_id") WHERE "question_versions"."status" = 'LIVE';--> statement-breakpoint
CREATE INDEX "question_versions_live_pool_idx" ON "question_versions" USING btree ("category_id","rating") WHERE "question_versions"."status" = 'LIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_solo_session" ON "game_sessions" USING btree ("owner_id") WHERE "game_sessions"."status" in ('CREATED','ACTIVE') and "game_sessions"."mode" = 'SOLO';--> statement-breakpoint
CREATE INDEX "game_sessions_open_activity_idx" ON "game_sessions" USING btree ("last_activity_at") WHERE "game_sessions"."status" in ('CREATED','ACTIVE');--> statement-breakpoint
CREATE INDEX "game_sessions_unprocessed_idx" ON "game_sessions" USING btree ("ended_at") WHERE "game_sessions"."post_processed_at" is null;--> statement-breakpoint
CREATE INDEX "game_sessions_owner_history_idx" ON "game_sessions" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_events_user_category_time_idx" ON "learning_events" USING btree ("user_id","category_id","occurred_at");--> statement-breakpoint
CREATE INDEX "learning_events_session_idx" ON "learning_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "skill_updates_user_category_idx" ON "skill_updates" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "point_ledger_week_user_idx" ON "point_ledger" USING btree ("week_key","user_id");--> statement-breakpoint
CREATE INDEX "point_ledger_user_idx" ON "point_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "streak_freezes_available_idx" ON "streak_freezes" USING btree ("user_id","earned_on_local_date") WHERE "streak_freezes"."status" = 'AVAILABLE';