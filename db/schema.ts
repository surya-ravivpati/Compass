/**
 * Database schema.
 *
 * Two kinds of table live here, and the difference governs everything about
 * how they are secured:
 *
 *   *Reference* tables (courses, prerequisites, pathways, requirements, clubs,
 *   meetings) are the school's catalog. Every signed-in student reads the same
 *   rows, and nobody writes them through the application at all -- they are
 *   loaded by the seed script using the service role.
 *
 *   *Student-owned* tables (profiles, completed courses, plan courses, plan
 *   activities) each carry a `user_id`, and row-level security confines every
 *   student to their own rows. See db/migrations/0001_rls.sql.
 *
 * Note on naming: the original data model called the grade columns `year`.
 * They are named `grade` here because `student_profiles.grad_year` is a
 * calendar year (2030) while these hold a grade level (9), and one column
 * called `year` holding 2030 next to another holding 9 is a bug waiting to be
 * written.
 */

import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { PrereqExpr } from "@/lib/solver/types";

/**
 * Supabase owns `auth.users`. It is declared here only so the foreign keys
 * below can point at it; `drizzle.config.ts` filters the auth schema out of
 * migrations so nothing tries to create or alter it.
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const subjectEnum = pgEnum("subject", [
  "math",
  "science",
  "english",
  "social_studies",
  "world_language",
  "computer_science",
  "arts",
  "pe_health",
  "elective",
]);

export const courseLevelEnum = pgEnum("course_level", ["regular", "honors", "ap"]);

export const seasonEnum = pgEnum("season", ["fall", "winter", "spring", "year_round"]);

export const requirementKindEnum = pgEnum("requirement_kind", [
  "credits_in_subject",
  "specific_course",
  "total_credits",
]);

/* ------------------------------------------------------------------ *
 * Reference: the catalog
 * ------------------------------------------------------------------ */

export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    /** Half-credit increments, so exact rather than floating point. */
    credits: numeric("credits", { precision: 3, scale: 1, mode: "number" }).notNull(),
    subject: subjectEnum("subject").notNull(),
    level: courseLevelEnum("level").notNull(),
    /** Terms in which the course may *start*: 1, 2, or both. */
    termsOffered: smallint("terms_offered").array().notNull(),
    /**
     * 1 = semester, 2 = full year. Not defaulted: a wrong duration silently
     * corrupts every downstream deadline. See lib/solver/types.ts.
     */
    durationTerms: smallint("duration_terms").notNull(),
  },
  (table) => [index("courses_subject_idx").on(table.subject)],
);

export const coursePrerequisites = pgTable("course_prerequisites", {
  courseId: text("course_id")
    .primaryKey()
    .references(() => courses.id, { onDelete: "cascade" }),
  /**
   * A PrereqExpr tree. Stored as JSON because prerequisites are boolean
   * expressions -- "Algebra 2 AND (Chemistry OR Physics)" -- and flattening
   * them into rows would lose the structure the solver depends on.
   *
   * JSON is exactly the shape TypeScript cannot vouch for, which is why
   * validation/catalog.ts parses every expression on the way in.
   */
  expression: jsonb("expression").$type<PrereqExpr>().notNull(),
});

export const pathways = pgTable("pathways", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** The culminating courses of a pathway. A goal is a set, not a single course. */
export const pathwayGoalCourses = pgTable(
  "pathway_goal_courses",
  {
    pathwayId: text("pathway_id")
      .notNull()
      .references(() => pathways.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.pathwayId, table.courseId] })],
);

export const graduationRequirements = pgTable("graduation_requirements", {
  id: text("id").primaryKey(),
  kind: requirementKindEnum("kind").notNull(),
  label: text("label").notNull(),
  /** Set for credits_in_subject. */
  subject: subjectEnum("subject"),
  /** Set for credits_in_subject and total_credits. */
  credits: numeric("credits", { precision: 4, scale: 1, mode: "number" }),
  /** Set for specific_course. */
  courseId: text("course_id").references(() => courses.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

/* ------------------------------------------------------------------ *
 * Reference: activities
 * ------------------------------------------------------------------ */

export const clubs = pgTable("clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  season: seasonEnum("season").notNull(),
  weeklyHours: numeric("weekly_hours", { precision: 4, scale: 1, mode: "number" }).notNull(),
  description: text("description").notNull(),
});

export const clubMeetings = pgTable(
  "club_meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    /** 0 = Sunday .. 6 = Saturday. */
    dayOfWeek: smallint("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (table) => [index("club_meetings_club_idx").on(table.clubId)],
);

/* ------------------------------------------------------------------ *
 * Student-owned (row-level security)
 * ------------------------------------------------------------------ */

export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  /** Calendar year of graduation, e.g. 2030. */
  gradYear: integer("grad_year").notNull(),
  goalPathwayId: text("goal_pathway_id").references(() => pathways.id, {
    onDelete: "set null",
  }),
  /** Weekly extracurricular hour cap; the student can change it in settings. */
  weeklyHourCap: integer("weekly_hour_cap").notNull().default(15),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const completedCourses = pgTable(
  "completed_courses",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /**
     * Grade level in which it was completed. Can be below 9: students commonly
     * finish Algebra 1 in 8th grade, and several pathways only fit four years
     * for someone who did.
     */
    grade: smallint("grade").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.courseId] })],
);

export const planCourses = pgTable(
  "plan_courses",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** Grade level 9-12. */
    grade: smallint("grade").notNull(),
    /** Term 1 or 2. */
    term: smallint("term").notNull(),
  },
  // One placement per course: the same course twice in a plan is a mistake,
  // not a choice, so the database refuses it rather than the UI remembering to.
  (table) => [primaryKey({ columns: [table.userId, table.courseId] })],
);

export const planActivities = pgTable(
  "plan_activities",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    startGrade: smallint("start_grade").notNull(),
    endGrade: smallint("end_grade").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.clubId] })],
);

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const coursesRelations = relations(courses, ({ one }) => ({
  prerequisite: one(coursePrerequisites, {
    fields: [courses.id],
    references: [coursePrerequisites.courseId],
  }),
}));

export const pathwaysRelations = relations(pathways, ({ many }) => ({
  goals: many(pathwayGoalCourses),
}));

export const pathwayGoalCoursesRelations = relations(pathwayGoalCourses, ({ one }) => ({
  pathway: one(pathways, {
    fields: [pathwayGoalCourses.pathwayId],
    references: [pathways.id],
  }),
  course: one(courses, {
    fields: [pathwayGoalCourses.courseId],
    references: [courses.id],
  }),
}));

export const clubsRelations = relations(clubs, ({ many }) => ({
  meetings: many(clubMeetings),
}));

export const clubMeetingsRelations = relations(clubMeetings, ({ one }) => ({
  club: one(clubs, { fields: [clubMeetings.clubId], references: [clubs.id] }),
}));

/** Every table a student owns. The RLS migration walks this list. */
export const STUDENT_OWNED_TABLES = [
  "student_profiles",
  "completed_courses",
  "plan_courses",
  "plan_activities",
] as const;

/** Every table that is read-only to students. */
export const REFERENCE_TABLES = [
  "courses",
  "course_prerequisites",
  "pathways",
  "pathway_goal_courses",
  "graduation_requirements",
  "clubs",
  "club_meetings",
] as const;
