/**
 * Load the school catalog out of the database and into solver types.
 *
 * This is the boundary where untyped rows become the shapes `lib/solver`
 * relies on. Prerequisite expressions in particular arrive as JSON, which
 * TypeScript cannot vouch for -- a mangled expression would not throw, it
 * would evaluate, and be confidently wrong about whether a student can
 * graduate. So every one is parsed through the Zod schema on the way in.
 *
 * Server-only: it goes through Drizzle's privileged connection, which is
 * appropriate here because the catalog is the same for every student and is
 * read-only to all of them.
 */

import { cache } from "react";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildCatalog, buildGraph } from "@/lib/solver/graph";
import type { CourseGraph } from "@/lib/solver/graph";
import type {
  Club,
  Course,
  Pathway,
  RequirementRule,
  Term,
} from "@/lib/solver/types";
import { minutesFromHHMM } from "@/lib/solver/types";
import { prereqExprSchema } from "@/validation/catalog";

export interface LoadedCatalog {
  readonly graph: CourseGraph;
  readonly courses: readonly Course[];
  readonly pathways: readonly Pathway[];
  readonly requirements: readonly RequirementRule[];
  readonly clubs: readonly Club[];
}

export class CatalogLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogLoadError";
  }
}

/**
 * `cache` dedupes this within a single request, so a page that needs the
 * catalog in three places pays for one query set.
 */
export const loadCatalog = cache(async (): Promise<LoadedCatalog> => {
  const database = db();

  const [courseRows, prereqRows, pathwayRows, goalRows, requirementRows, clubRows, meetingRows] =
    await Promise.all([
      database.select().from(schema.courses).orderBy(asc(schema.courses.title)),
      database.select().from(schema.coursePrerequisites),
      database.select().from(schema.pathways).orderBy(asc(schema.pathways.sortOrder)),
      database.select().from(schema.pathwayGoalCourses),
      database
        .select()
        .from(schema.graduationRequirements)
        .orderBy(asc(schema.graduationRequirements.sortOrder)),
      database.select().from(schema.clubs).orderBy(asc(schema.clubs.name)),
      database.select().from(schema.clubMeetings),
    ]);

  if (courseRows.length === 0) {
    throw new CatalogLoadError(
      "The course catalog is empty. Run `npm run db:seed` to load it.",
    );
  }

  const prereqByCourse = new Map(prereqRows.map((row) => [row.courseId, row.expression]));

  const courses: Course[] = courseRows.map((row) => {
    const raw = prereqByCourse.get(row.id) ?? { kind: "none" as const };
    const parsed = prereqExprSchema.safeParse(raw);
    if (!parsed.success) {
      throw new CatalogLoadError(
        `Course "${row.id}" has a malformed prerequisite expression in the ` +
          `database: ${parsed.error.issues[0]?.message ?? "unknown problem"}. ` +
          `Re-run \`npm run db:seed\`.`,
      );
    }

    return {
      id: row.id,
      code: row.code,
      title: row.title,
      credits: row.credits,
      subject: row.subject,
      level: row.level,
      termsOffered: row.termsOffered as Term[],
      durationTerms: row.durationTerms === 1 ? 1 : 2,
      prereq: parsed.data,
    };
  });

  // buildGraph validates the whole thing and refuses a cyclic catalog, so a
  // bad seed fails here rather than hanging a reachability pass later.
  const graph = buildGraph(buildCatalog(courses));

  const goalsByPathway = new Map<string, string[]>();
  for (const row of goalRows) {
    const existing = goalsByPathway.get(row.pathwayId);
    if (existing === undefined) goalsByPathway.set(row.pathwayId, [row.courseId]);
    else existing.push(row.courseId);
  }

  const pathways: Pathway[] = pathwayRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    goalCourseIds: goalsByPathway.get(row.id) ?? [],
  }));

  const requirements: RequirementRule[] = requirementRows.map((row) => {
    switch (row.kind) {
      case "credits_in_subject":
        if (row.subject === null || row.credits === null) {
          throw new CatalogLoadError(`Requirement "${row.id}" is missing a subject or credits.`);
        }
        return {
          kind: "credits_in_subject",
          id: row.id,
          label: row.label,
          subject: row.subject,
          credits: row.credits,
        };
      case "total_credits":
        if (row.credits === null) {
          throw new CatalogLoadError(`Requirement "${row.id}" is missing credits.`);
        }
        return { kind: "total_credits", id: row.id, label: row.label, credits: row.credits };
      case "specific_course":
        if (row.courseId === null) {
          throw new CatalogLoadError(`Requirement "${row.id}" is missing a course.`);
        }
        return {
          kind: "specific_course",
          id: row.id,
          label: row.label,
          courseId: row.courseId,
        };
    }
  });

  const meetingsByClub = new Map<string, Club["meetings"][number][]>();
  for (const row of meetingRows) {
    const meeting = {
      dayOfWeek: row.dayOfWeek as Club["meetings"][number]["dayOfWeek"],
      // Postgres `time` comes back as "15:30:00"; the solver works in minutes.
      startMinute: minutesFromHHMM(row.startTime.slice(0, 5)),
      endMinute: minutesFromHHMM(row.endTime.slice(0, 5)),
    };
    const existing = meetingsByClub.get(row.clubId);
    if (existing === undefined) meetingsByClub.set(row.clubId, [meeting]);
    else existing.push(meeting);
  }

  const clubs: Club[] = clubRows.map((row) => ({
    id: row.id,
    name: row.name,
    season: row.season,
    weeklyHours: row.weeklyHours,
    description: row.description,
    meetings: meetingsByClub.get(row.id) ?? [],
  }));

  return { graph, courses, pathways, requirements, clubs };
});
