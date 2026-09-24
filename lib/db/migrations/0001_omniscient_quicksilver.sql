ALTER TABLE "courses" ADD COLUMN "workload_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "satisfies_from_grade" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "by_placement" boolean DEFAULT false NOT NULL;