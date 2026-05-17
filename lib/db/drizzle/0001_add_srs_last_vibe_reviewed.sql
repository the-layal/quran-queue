ALTER TABLE "srs_items" ADD COLUMN IF NOT EXISTS "last_vibe_scale" integer;--> statement-breakpoint
ALTER TABLE "srs_items" ADD COLUMN IF NOT EXISTS "last_reviewed_at" timestamp with time zone;
