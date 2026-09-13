/**
 * Runtime validation for catalog data.
 *
 * TypeScript guarantees the *shape* of data written in TypeScript, and that
 * covers the fixtures. It guarantees nothing about data that arrives as JSON,
 * which is how prerequisite expressions are stored (see the data model) and
 * how the production catalog will reach the solver in Phase 2.
 *
 * A prerequisite expression that has been quietly mangled -- an `or` with no
 * children, a `course` node missing its id -- would not throw. It would
 * evaluate, and produce a wrong answer about a student's graduation. So these
 * schemas exist to make bad catalog data fail loudly at the boundary rather
 * than silently downstream.
 */

import { z } from "zod";
import type { PrereqExpr } from "@/lib/solver/types";

const courseIdSchema = z.string().min(1);

export const prereqExprSchema: z.ZodType<PrereqExpr> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("course"), courseId: courseIdSchema }),
    z.object({ kind: z.literal("concurrent"), courseId: courseIdSchema }),
    // An AND or OR with no children is almost certainly a data bug rather than
    // a deliberate tautology, and an empty OR in particular is unsatisfiable --
    // it would quietly make a course impossible for every student.
    z.object({ kind: z.literal("and"), children: z.array(prereqExprSchema).min(1) }),
    z.object({ kind: z.literal("or"), children: z.array(prereqExprSchema).min(1) }),
  ]),
);

export const subjectSchema = z.enum([
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

export const termSchema = z.union([z.literal(1), z.literal(2)]);

export const courseSchema = z.object({
  id: courseIdSchema,
  code: z.string().min(1),
  title: z.string().min(1),
  credits: z.number().min(0),
  subject: subjectSchema,
  level: z.enum(["regular", "honors", "ap"]),
  termsOffered: z.array(termSchema).min(1),
  durationTerms: z.union([z.literal(1), z.literal(2)]),
  prereq: prereqExprSchema,
});

export const seasonSchema = z.enum(["fall", "winter", "spring", "year_round"]);

export const clubMeetingSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(24 * 60),
    endMinute: z.number().int().min(0).max(24 * 60),
  })
  .refine((meeting) => meeting.startMinute < meeting.endMinute, {
    message: "A meeting must end after it starts.",
  });

export const clubSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  season: seasonSchema,
  weeklyHours: z.number().min(0),
  description: z.string(),
  meetings: z.array(clubMeetingSchema),
});

export const pathwaySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  goalCourseIds: z.array(courseIdSchema),
});

export const requirementRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("credits_in_subject"),
    id: z.string().min(1),
    label: z.string().min(1),
    subject: subjectSchema,
    credits: z.number().positive(),
  }),
  z.object({
    kind: z.literal("specific_course"),
    id: z.string().min(1),
    label: z.string().min(1),
    courseId: courseIdSchema,
  }),
  z.object({
    kind: z.literal("total_credits"),
    id: z.string().min(1),
    label: z.string().min(1),
    credits: z.number().positive(),
  }),
]);

export const courseListSchema = z.array(courseSchema);
export const clubListSchema = z.array(clubSchema);
export const pathwayListSchema = z.array(pathwaySchema);
export const requirementListSchema = z.array(requirementRuleSchema);

/**
 * Check that everything a pathway and a requirement set point at actually
 * exists. Cross-reference errors are the failure mode schemas cannot catch on
 * their own -- each record is individually well-formed, and the catalog is
 * still incoherent.
 */
export function assertReferencesResolve(
  courses: readonly { id: string }[],
  pathways: readonly { id: string; goalCourseIds: readonly string[] }[],
  requirements: readonly { id: string; kind: string; courseId?: string }[],
): void {
  const ids = new Set(courses.map((course) => course.id));

  for (const pathway of pathways) {
    for (const goalId of pathway.goalCourseIds) {
      if (!ids.has(goalId)) {
        throw new Error(
          `Pathway "${pathway.id}" names goal course "${goalId}", which is not in the catalog.`,
        );
      }
    }
  }

  for (const rule of requirements) {
    if (rule.kind !== "specific_course") continue;
    if (rule.courseId === undefined || !ids.has(rule.courseId)) {
      throw new Error(
        `Requirement "${rule.id}" names course "${rule.courseId}", which is not in the catalog.`,
      );
    }
  }
}
