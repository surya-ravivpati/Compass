CREATE TABLE "ai_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"school_id" text NOT NULL,
	"id" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"description" text NOT NULL,
	"credits" real NOT NULL,
	"duration_terms" integer NOT NULL,
	"grades" integer[] NOT NULL,
	"seasons" text[] NOT NULL,
	"level" text NOT NULL,
	"workload" integer NOT NULL,
	"lab" boolean DEFAULT false NOT NULL,
	"tags" text[] NOT NULL,
	"satisfies" text[] NOT NULL,
	"sequence_id" text,
	"sequence_step" integer,
	"equivalence_group" text,
	"max_enrollments" integer,
	"notes" text[],
	"source" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "courses_school_id_id_pk" PRIMARY KEY("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "plan_courses" (
	"version_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"term" integer NOT NULL,
	CONSTRAINT "plan_courses_version_id_course_id_term_pk" PRIMARY KEY("version_id","course_id","term")
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"change" jsonb NOT NULL,
	"validation_status" text NOT NULL,
	"reasons" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_unique" UNIQUE("plan_id","version")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prerequisites" (
	"school_id" text NOT NULL,
	"course_id" text NOT NULL,
	"group_index" integer NOT NULL,
	"option_index" integer NOT NULL,
	"prerequisite_course_id" text NOT NULL,
	"timing" text NOT NULL,
	"note" text,
	CONSTRAINT "prerequisites_school_id_course_id_group_index_prerequisite_course_id_pk" PRIMARY KEY("school_id","course_id","group_index","prerequisite_course_id")
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"school_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"credits" real NOT NULL,
	"kind" text NOT NULL,
	"same_sequence" boolean DEFAULT false NOT NULL,
	"must_include" jsonb,
	"sort_order" integer NOT NULL,
	"source" jsonb NOT NULL,
	CONSTRAINT "requirements_school_id_id_pk" PRIMARY KEY("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	"catalog_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"term" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_courses_unique" UNIQUE("student_id","course_id","term")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"school_id" text,
	"first_name" text,
	"grade" integer,
	"year_started" boolean DEFAULT false NOT NULL,
	"academic_year" integer,
	"graduation_year" integer,
	"start_term" integer,
	"math_placement" text,
	"math_placement_note" text,
	"preferences" jsonb,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_version_id_plan_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_school_id_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_school_id_prerequisite_course_id_courses_school_id_id_fk" FOREIGN KEY ("school_id","prerequisite_course_id") REFERENCES "public"."courses"("school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_courses" ADD CONSTRAINT "student_courses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_department_idx" ON "courses" USING btree ("school_id","department");--> statement-breakpoint
CREATE INDEX "plans_student_idx" ON "plans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_courses_student_idx" ON "student_courses" USING btree ("student_id");