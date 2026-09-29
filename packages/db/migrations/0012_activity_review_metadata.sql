ALTER TABLE "activity_versions" ADD COLUMN "source" text DEFAULT 'Development fixture' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD COLUMN "license" text DEFAULT 'Development only' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_versions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_activity_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.status <> 'DRAFT' OR EXISTS (SELECT 1 FROM content_audit_log WHERE entity_id=OLD.id AND to_status='IN_REVIEW')) AND (NEW.content_json IS DISTINCT FROM OLD.content_json OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'Reviewed assessment content is immutable';
  END IF;
  RETURN NEW;
END; $$;
