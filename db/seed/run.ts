/**
 * Load the catalog into the database.
 *
 * Two properties matter here:
 *
 *   **It validates before it writes.** Every check in validate.ts runs first,
 *   and any failure aborts before a single row is touched. A half-loaded
 *   catalog is worse than no catalog.
 *
 *   **It never deletes a student's work.** Courses and clubs are upserted
 *   rather than replaced, because `ON DELETE CASCADE` from `courses` reaches
 *   into `plan_courses` and `completed_courses`. A course withdrawn from the
 *   catalog is reported, not removed -- deciding what happens to the students
 *   who planned it is a judgement call, not something a seed script should
 *   make at 2am.
 */

import { inArray, notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema";
import { SEED_COURSES, SEED_PATHWAYS, SEED_REQUIREMENTS } from "./catalog";
import { SEED_CLUBS } from "./clubs";
import { validateSeedData } from "./validate";

export interface SeedSummary {
  readonly courses: number;
  readonly prerequisites: number;
  readonly pathways: number;
  readonly requirements: number;
  readonly clubs: number;
  readonly meetings: number;
  /**
   * Rows in the database that the catalog no longer lists. Left in place on
   * purpose; removing them would cascade into student plans.
   */
  readonly orphanedCourseIds: readonly string[];
  readonly orphanedClubIds: readonly string[];
}

type Database = PostgresJsDatabase<typeof schema>;

/** Minutes from midnight -> "15:30:00", for a Postgres `time` column. */
function toTimeString(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export async function seedDatabase(database: Database): Promise<SeedSummary> {
  // Nothing is written until this returns.
  validateSeedData();

  const courseIds = SEED_COURSES.map((course) => course.id);
  const clubIds = SEED_CLUBS.map((club) => club.id);

  return database.transaction(async (tx) => {
    /* ---------------------------- courses ---------------------------- */
    await tx
      .insert(schema.courses)
      .values(
        SEED_COURSES.map((course) => ({
          id: course.id,
          code: course.code,
          title: course.title,
          credits: course.credits,
          subject: course.subject,
          level: course.level,
          termsOffered: [...course.termsOffered],
          durationTerms: course.durationTerms,
        })),
      )
      .onConflictDoUpdate({
        target: schema.courses.id,
        set: {
          code: sqlExcluded("code"),
          title: sqlExcluded("title"),
          credits: sqlExcluded("credits"),
          subject: sqlExcluded("subject"),
          level: sqlExcluded("level"),
          termsOffered: sqlExcluded("terms_offered"),
          durationTerms: sqlExcluded("duration_terms"),
        },
      });

    await tx
      .insert(schema.coursePrerequisites)
      .values(
        SEED_COURSES.map((course) => ({
          courseId: course.id,
          expression: course.prereq,
        })),
      )
      .onConflictDoUpdate({
        target: schema.coursePrerequisites.courseId,
        set: { expression: sqlExcluded("expression") },
      });

    /* --------------------------- pathways ---------------------------- */
    await tx
      .insert(schema.pathways)
      .values(
        SEED_PATHWAYS.map((pathway) => ({
          id: pathway.id,
          name: pathway.name,
          description: pathway.description,
          sortOrder: pathway.sortOrder,
        })),
      )
      .onConflictDoUpdate({
        target: schema.pathways.id,
        set: {
          name: sqlExcluded("name"),
          description: sqlExcluded("description"),
          sortOrder: sqlExcluded("sort_order"),
        },
      });

    // Join table, no student data attached: safe to replace wholesale.
    await tx.delete(schema.pathwayGoalCourses);
    const goals = SEED_PATHWAYS.flatMap((pathway) =>
      pathway.goalCourseIds.map((courseId) => ({ pathwayId: pathway.id, courseId })),
    );
    if (goals.length > 0) await tx.insert(schema.pathwayGoalCourses).values(goals);

    /* ------------------------- requirements -------------------------- */
    await tx
      .insert(schema.graduationRequirements)
      .values(
        SEED_REQUIREMENTS.map((rule) => ({
          id: rule.id,
          kind: rule.kind,
          label: rule.label,
          subject: rule.kind === "credits_in_subject" ? rule.subject : null,
          credits: rule.kind === "specific_course" ? null : rule.credits,
          courseId: rule.kind === "specific_course" ? rule.courseId : null,
          sortOrder: rule.sortOrder,
        })),
      )
      .onConflictDoUpdate({
        target: schema.graduationRequirements.id,
        set: {
          kind: sqlExcluded("kind"),
          label: sqlExcluded("label"),
          subject: sqlExcluded("subject"),
          credits: sqlExcluded("credits"),
          courseId: sqlExcluded("course_id"),
          sortOrder: sqlExcluded("sort_order"),
        },
      });

    /* ----------------------------- clubs ----------------------------- */
    await tx
      .insert(schema.clubs)
      .values(
        SEED_CLUBS.map((club) => ({
          id: club.id,
          name: club.name,
          season: club.season,
          weeklyHours: club.weeklyHours,
          description: club.description,
        })),
      )
      .onConflictDoUpdate({
        target: schema.clubs.id,
        set: {
          name: sqlExcluded("name"),
          season: sqlExcluded("season"),
          weeklyHours: sqlExcluded("weekly_hours"),
          description: sqlExcluded("description"),
        },
      });

    // Meetings have no natural key and nothing references them; replacing the
    // set for the clubs we know about is simplest and safe.
    await tx.delete(schema.clubMeetings).where(inArray(schema.clubMeetings.clubId, clubIds));
    const meetings = SEED_CLUBS.flatMap((club) =>
      club.meetings.map((meeting) => ({
        clubId: club.id,
        dayOfWeek: meeting.dayOfWeek,
        startTime: toTimeString(meeting.startMinute),
        endTime: toTimeString(meeting.endMinute),
      })),
    );
    if (meetings.length > 0) await tx.insert(schema.clubMeetings).values(meetings);

    /* --------------------------- leftovers --------------------------- */
    const orphanedCourses = await tx
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(notInArray(schema.courses.id, courseIds));

    const orphanedClubs = await tx
      .select({ id: schema.clubs.id })
      .from(schema.clubs)
      .where(notInArray(schema.clubs.id, clubIds));

    return {
      courses: SEED_COURSES.length,
      prerequisites: SEED_COURSES.length,
      pathways: SEED_PATHWAYS.length,
      requirements: SEED_REQUIREMENTS.length,
      clubs: SEED_CLUBS.length,
      meetings: meetings.length,
      orphanedCourseIds: orphanedCourses.map((row) => row.id),
      orphanedClubIds: orphanedClubs.map((row) => row.id),
    };
  });
}

/** `excluded.<column>` -- the value Postgres was about to insert. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
