CREATE TABLE "daily_challenge_questions" (
	"daily_challenge_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"question_version_id" uuid NOT NULL,
	CONSTRAINT "daily_challenge_questions_daily_challenge_id_position_pk" PRIMARY KEY("daily_challenge_id","position")
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_challenges_challenge_date_unique" UNIQUE("challenge_date")
);
--> statement-breakpoint
ALTER TABLE "daily_challenge_questions" ADD CONSTRAINT "daily_challenge_questions_daily_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("daily_challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_challenge_questions" ADD CONSTRAINT "daily_challenge_questions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_daily_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("daily_challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_challenge_questions ENABLE ROW LEVEL SECURITY;
