CREATE TYPE "public"."solo_activity_kind" AS ENUM('speed_math', 'memory_match', 'dialogue_scenario');--> statement-breakpoint
CREATE TABLE "activity_assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"source_key" text NOT NULL,
	"category_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"options_json" jsonb,
	"answer_json" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"rating" numeric(7, 2) NOT NULL,
	"served_at" timestamp with time zone NOT NULL,
	"reveal_until" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"outcome" "answer_outcome",
	"response_json" jsonb,
	"correctness" numeric(4, 3),
	"speed_factor" numeric(5, 4),
	"resolved_at" timestamp with time zone,
	"result_json" jsonb,
	CONSTRAINT "activity_assessment_source_unique" UNIQUE("session_id","user_id","source_key"),
	CONSTRAINT "activity_assessment_position_unique" UNIQUE("session_id","position")
);
--> statement-breakpoint
CREATE TABLE "activity_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"node_id" text,
	"deadline_at" timestamp with time zone,
	"finished" boolean DEFAULT false NOT NULL,
	"best_ending" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"version_number" integer NOT NULL,
	"kind" "solo_activity_kind" NOT NULL,
	"name" text NOT NULL,
	"status" "content_status" NOT NULL,
	"origin" "content_origin" NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"author_id" uuid,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_version_unique" UNIQUE("slug","version_number")
);
--> statement-breakpoint
ALTER TABLE "activity_assessments" ADD CONSTRAINT "activity_assessments_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assessments" ADD CONSTRAINT "activity_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assessments" ADD CONSTRAINT "activity_assessments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_version_id_activity_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."activity_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD CONSTRAINT "activity_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD CONSTRAINT "activity_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE activity_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE activity_assessments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX activity_one_live ON activity_versions(slug) WHERE status = 'LIVE';
--> statement-breakpoint
ALTER TABLE activity_versions ADD CONSTRAINT activity_reviewer_distinct CHECK (reviewed_by IS NULL OR reviewed_by <> author_id);
--> statement-breakpoint
ALTER TABLE activity_assessments ADD CONSTRAINT activity_correctness_range CHECK (correctness BETWEEN 0 AND 1);
--> statement-breakpoint
CREATE FUNCTION protect_activity_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (NEW.content_json IS DISTINCT FROM OLD.content_json OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'Published assessment content is immutable';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER activity_content_immutable BEFORE UPDATE ON activity_versions FOR EACH ROW EXECUTE FUNCTION protect_activity_content();
