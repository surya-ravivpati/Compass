/**
 * Load a student's own plan.
 *
 * Goes through the Supabase client carrying the student's access token, never
 * through Drizzle: row-level security then enforces ownership in Postgres
 * against a verified identity, rather than this file remembering to add a
 * `WHERE user_id = ...`. A forgotten filter here would be a data breach; a
 * missing policy is caught by the tests in tests/db.
 */

import { createClient } from "@/lib/supabase/server";
import type { Grade, Plan, Term } from "@/lib/solver/types";
import { currentGradeFor } from "./current-grade";

export interface StudentProfile {
  readonly gradYear: number;
  readonly goalPathwayId: string | null;
  readonly weeklyHourCap: number;
}

export interface LoadedPlan {
  readonly profile: StudentProfile;
  readonly plan: Plan;
}

export class PlanLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLoadError";
  }
}

/** Returns null when the student has not finished setup yet. */
export async function loadPlan(userId: string, now = new Date()): Promise<LoadedPlan | null> {
  const supabase = await createClient();

  const [profileResult, completedResult, placementsResult] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("grad_year, goal_pathway_id, weekly_hour_cap")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("completed_courses").select("course_id, grade").eq("user_id", userId),
    supabase.from("plan_courses").select("course_id, grade, term").eq("user_id", userId),
  ]);

  if (profileResult.error !== null) throw new PlanLoadError(profileResult.error.message);
  if (profileResult.data === null) return null;
  if (completedResult.error !== null) throw new PlanLoadError(completedResult.error.message);
  if (placementsResult.error !== null) throw new PlanLoadError(placementsResult.error.message);

  const gradYear = profileResult.data.grad_year;

  return {
    profile: {
      gradYear,
      goalPathwayId: profileResult.data.goal_pathway_id,
      weeklyHourCap: profileResult.data.weekly_hour_cap,
    },
    plan: {
      gradYear,
      currentGrade: currentGradeFor(gradYear, now),
      completed: completedResult.data.map((row) => ({
        courseId: row.course_id,
        grade: row.grade,
      })),
      placements: placementsResult.data.map((row) => ({
        courseId: row.course_id,
        grade: row.grade as Grade,
        term: row.term as Term,
      })),
    },
  };
}
