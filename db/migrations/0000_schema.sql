CREATE TYPE "public"."course_level" AS ENUM('regular', 'honors', 'ap');--> statement-breakpoint
CREATE TYPE "public"."requirement_kind" AS ENUM('credits_in_subject', 'specific_course', 'total_credits');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('fall', 'winter', 'spring', 'year_round');--> statement-breakpoint
CREATE TYPE "public"."subject" AS ENUM('math', 'science', 'english', 'social_studies', 'world_language', 'computer_science', 'arts', 'pe_health', 'elective');--> statement-breakpoint
-- Supabase already owns auth.users; these are guarded so this migration is a
-- no-op there while still standing up a minimal stub on a bare Postgres (which
-- is how the RLS proof in tests/db runs without a Supabase project). Drizzle
-- emits an unguarded CREATE TABLE because the foreign keys below reference it.
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season" "season" NOT NULL,
	"weekly_hours" numeric(4, 1) NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completed_courses" (
	"user_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"grade" smallint NOT NULL,
	CONSTRAINT "completed_courses_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "course_prerequisites" (
	"course_id" text PRIMARY KEY NOT NULL,
	"expression" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"credits" numeric(3, 1) NOT NULL,
	"subject" "subject" NOT NULL,
	"level" "course_level" NOT NULL,
	"terms_offered" smallint[] NOT NULL,
	"duration_terms" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graduation_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "requirement_kind" NOT NULL,
	"label" text NOT NULL,
	"subject" "subject",
	"credits" numeric(4, 1),
	"course_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathway_goal_courses" (
	"pathway_id" text NOT NULL,
	"course_id" text NOT NULL,
	CONSTRAINT "pathway_goal_courses_pathway_id_course_id_pk" PRIMARY KEY("pathway_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "pathways" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_activities" (
	"user_id" uuid NOT NULL,
	"club_id" text NOT NULL,
	"start_grade" smallint NOT NULL,
	"end_grade" smallint NOT NULL,
	CONSTRAINT "plan_activities_user_id_club_id_pk" PRIMARY KEY("user_id","club_id")
);
--> statement-breakpoint
CREATE TABLE "plan_courses" (
	"user_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"grade" smallint NOT NULL,
	"term" smallint NOT NULL,
	CONSTRAINT "plan_courses_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"grad_year" integer NOT NULL,
	"goal_pathway_id" text,
	"weekly_hour_cap" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_meetings" ADD CONSTRAINT "club_meetings_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_courses" ADD CONSTRAINT "completed_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_courses" ADD CONSTRAINT "completed_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_requirements" ADD CONSTRAINT "graduation_requirements_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_goal_courses" ADD CONSTRAINT "pathway_goal_courses_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathway_goal_courses" ADD CONSTRAINT "pathway_goal_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_goal_pathway_id_pathways_id_fk" FOREIGN KEY ("goal_pathway_id") REFERENCES "public"."pathways"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_meetings_club_idx" ON "club_meetings" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "courses_subject_idx" ON "courses" USING btree ("subject");