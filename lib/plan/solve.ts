/**
 * Turn a plan into everything the planner UI needs to draw.
 *
 * Kept out of the components deliberately. This is where the solver's several
 * outputs get combined into one view of each course, and doing that inside a
 * React component would make it untestable without a DOM and tempt the next
 * person to add "just one more" rule next to a `useMemo`.
 *
 * Pure: same inputs, same output, no I/O.
 */

import type {
  Course,
  CourseId,
  Grade,
  Placement,
  Plan,
  RequirementResult,
  RequirementRule,
} from "@/lib/solver/types";
import { gradeOfIndex } from "@/lib/solver/types";
import type { CourseGraph } from "@/lib/solver/graph";
import {
  backwardReachable,
  latestStartTerms,
  prereqViolations,
  strictlyRequired,
  unreachable,
} from "@/lib/solver/reachability";
import { checkAll } from "@/lib/solver/requirements";

/**
 * Ordered by how much the student needs to know about it. `violation` outranks
 * `unreachable` because it is something they did just now and can undo.
 */
export type CourseState =
  | "completed"
  | "violation"
  | "placed"
  | "unreachable"
  | "available";

export interface CourseView {
  readonly course: Course;
  readonly state: CourseState;
  readonly placement: Placement | null;
  /**
   * A completed course is pinned in this prior grade rather than appearing as
   * something the student can move. `null` covers coursework completed before
   * high school (for example Algebra 1 in grade 8), which has no column on
   * the four-year board.
   */
  readonly completedGrade: number | null;
  /** Plain-English explanation, present for `violation` and `unreachable`. */
  readonly reason: string | null;
  /** The goal cannot be reached without this course. */
  readonly required: boolean;
  /** This course could contribute to the goal, by some route. */
  readonly relevant: boolean;
  /** Latest grade it can still start, given the goal. Null when it no longer fits. */
  readonly latestStartGrade: Grade | null;
}

export interface SolvedPlan {
  readonly views: readonly CourseView[];
  readonly byCourseId: ReadonlyMap<CourseId, CourseView>;
  readonly requirements: readonly RequirementResult[];
  readonly status: "on_track" | "at_risk";
  /** The few things most worth saying, most important first. */
  readonly headlines: readonly string[];
  readonly violationCount: number;
  readonly unreachableCount: number;
}

export function solvePlan(
  plan: Plan,
  graph: CourseGraph,
  rules: readonly RequirementRule[],
  goalCourseIds: readonly CourseId[],
): SolvedPlan {
  const unreachableList = unreachable(plan, graph);
  const violationList = prereqViolations(plan, graph);
  const requirements = checkAll(plan, graph.catalog, rules);
  const latestStarts = latestStartTerms(graph, goalCourseIds);
  const required = strictlyRequired(graph, goalCourseIds);
  const relevant = backwardReachable(graph, goalCourseIds);

  const unreachableReasons = new Map(unreachableList.map((f) => [f.courseId, f.reason]));
  const violationReasons = new Map(violationList.map((v) => [v.courseId, v.reason]));
  const completedGrades = new Map(
    plan.completed.map((entry) => [entry.courseId, entry.grade]),
  );
  const placements = new Map(plan.placements.map((p) => [p.courseId, p]));

  const views: CourseView[] = graph.catalog.all.map((course) => {
    const placement = placements.get(course.id) ?? null;

    const state: CourseState = completedGrades.has(course.id)
      ? "completed"
      : violationReasons.has(course.id)
        ? "violation"
        : placement !== null
          ? "placed"
          : unreachableReasons.has(course.id)
            ? "unreachable"
            : "available";

    const latestIndex = latestStarts.get(course.id) ?? null;

    return {
      course,
      state,
      placement,
      completedGrade: completedGrades.get(course.id) ?? null,
      reason: violationReasons.get(course.id) ?? unreachableReasons.get(course.id) ?? null,
      required: required.has(course.id),
      relevant: relevant.has(course.id),
      latestStartGrade: latestIndex === null ? null : gradeOfIndex(latestIndex),
    };
  });

  const byCourseId = new Map(views.map((view) => [view.course.id, view]));

  // A course being out of reach only matters to this student if their goal
  // actually needs it. Half the catalog is unreachable for everyone; saying so
  // would be noise.
  const blockedRequired = views.filter(
    (view) => view.required && view.state === "unreachable",
  );

  const requirementsAtRisk = requirements.filter((r) => r.status === "at_risk");

  const status: SolvedPlan["status"] =
    violationList.length === 0 &&
    blockedRequired.length === 0 &&
    requirementsAtRisk.length === 0
      ? "on_track"
      : "at_risk";

  const headlines: string[] = [];
  for (const view of blockedRequired) {
    if (view.reason !== null) headlines.push(view.reason);
  }
  for (const violation of violationList) {
    headlines.push(violation.reason);
  }
  if (requirementsAtRisk.length > 0) {
    const names = requirementsAtRisk.map((r) => r.rule.label);
    headlines.push(
      names.length === 1
        ? `Your plan does not yet meet the ${names[0]} requirement.`
        : `Your plan does not yet meet these requirements: ${names.join(", ")}.`,
    );
  }

  return {
    views,
    byCourseId,
    requirements,
    status,
    // Three is enough to act on. A wall of warnings gets scrolled past.
    headlines: headlines.slice(0, 3),
    violationCount: violationList.length,
    unreachableCount: unreachableList.length,
  };
}
