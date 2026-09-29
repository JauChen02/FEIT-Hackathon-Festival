CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION protect_question_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.status <> 'DRAFT' OR EXISTS (SELECT 1 FROM content_audit_log WHERE entity_id=OLD.id AND to_status='IN_REVIEW'))
 AND (NEW.type IS DISTINCT FROM OLD.type OR NEW.prompt IS DISTINCT FROM OLD.prompt OR NEW.options_json IS DISTINCT FROM OLD.options_json OR NEW.answer_json IS DISTINCT FROM OLD.answer_json OR NEW.explanation IS DISTINCT FROM OLD.explanation OR NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.sub_topic IS DISTINCT FROM OLD.sub_topic OR NEW.difficulty IS DISTINCT FROM OLD.difficulty OR NEW.rating IS DISTINCT FROM OLD.rating) THEN
 RAISE EXCEPTION 'Reviewed assessment content is immutable; create a new version';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER question_content_immutable BEFORE UPDATE ON question_versions FOR EACH ROW EXECUTE FUNCTION protect_question_content();
