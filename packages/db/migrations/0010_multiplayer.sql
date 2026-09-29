CREATE TYPE "public"."lobby_status" AS ENUM('OPEN', 'STARTING', 'IN_MATCH', 'CLOSED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "friend_bonus_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_low_id" uuid NOT NULL,
	"user_high_id" uuid NOT NULL,
	"utc_date" text NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "friend_grant_session_pair" UNIQUE("session_id","user_low_id","user_high_id"),
	CONSTRAINT "friend_grant_daily_slot" UNIQUE("user_low_id","user_high_id","utc_date","ordinal")
);
--> statement-breakpoint
CREATE TABLE "lobbies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"host_id" uuid NOT NULL,
	"game_type" text NOT NULL,
	"status" "lobby_status" NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lobbies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lobby_members" (
	"lobby_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lobby_members_lobby_id_user_id_pk" PRIMARY KEY("lobby_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_bonus_grants" ADD CONSTRAINT "friend_bonus_grants_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_bonus_grants" ADD CONSTRAINT "friend_bonus_grants_user_low_id_users_id_fk" FOREIGN KEY ("user_low_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_bonus_grants" ADD CONSTRAINT "friend_bonus_grants_user_high_id_users_id_fk" FOREIGN KEY ("user_high_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_bonus_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_bonus_grants ADD CONSTRAINT friend_grant_pair_normalized CHECK (user_low_id < user_high_id);
ALTER TABLE friend_bonus_grants ADD CONSTRAINT friend_grant_daily_cap CHECK (ordinal BETWEEN 1 AND 5);
