"use server";

/**
 * Mutations on a student's own plan.
 *
 * Each one re-reads the signed-in user from the session rather than trusting a
 * user id from the client, and writes through the Supabase client so
 * row-level security applies. The WITH CHECK policies would reject a forged
 * `user_id` anyway; not sending one at all means there is nothing to forge.
 *
 * These return a result instead of throwing. The planner applies changes
 * optimistically so dragging feels instant, which means a failed write has to
 * come back as something the UI can show -- silently diverging from what the
 * student is looking at is the one outcome worth going out of the way to
 * avoid.
 */

import { createClient } from "@/lib/supabase/server";
import {
  courseIdSchema,
  goalPathwaySchema,
  placementSchema,
  weeklyHourCapSchema,
} from "@/validation/plan";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_SIGNED_IN = "You have been signed out. Reload the page to sign back in.";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || data.user === null) return null;
  return data.user.id;
}

export async function placeCourse(input: unknown): Promise<ActionResult> {
  const parsed = placementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That is not a slot on the board." };
  }

  const userId = await currentUserId();
  if (userId === null) return { ok: false, error: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase.from("plan_courses").upsert(
    {
      user_id: userId,
      course_id: parsed.data.courseId,
      grade: parsed.data.grade,
      term: parsed.data.term,
    },
    { onConflict: "user_id,course_id" },
  );

  if (error !== null) {
    // A foreign key violation here means the course id is not in the catalog.
    return {
      ok: false,
      error:
        error.code === "23503"
          ? "That course is no longer in the catalog."
          : "Could not save that change.",
    };
  }

  return { ok: true };
}

export async function removeCourse(input: unknown): Promise<ActionResult> {
  const parsed = courseIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a course." };

  const userId = await currentUserId();
  if (userId === null) return { ok: false, error: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase
    .from("plan_courses")
    .delete()
    .eq("user_id", userId)
    .eq("course_id", parsed.data);

  if (error !== null) return { ok: false, error: "Could not remove that course." };
  return { ok: true };
}

export async function setGoalPathway(input: unknown): Promise<ActionResult> {
  const parsed = goalPathwaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a pathway." };

  const userId = await currentUserId();
  if (userId === null) return { ok: false, error: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_profiles")
    .update({ goal_pathway_id: parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error !== null) return { ok: false, error: "Could not save your goal." };
  return { ok: true };
}

export async function setWeeklyHourCap(input: unknown): Promise<ActionResult> {
  const parsed = weeklyHourCapSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check that number." };
  }

  const userId = await currentUserId();
  if (userId === null) return { ok: false, error: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_profiles")
    .update({ weekly_hour_cap: parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error !== null) return { ok: false, error: "Could not save that." };
  return { ok: true };
}
