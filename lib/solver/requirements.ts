/**
 * Graduation requirement checking.
 *
 * The three statuses carry a distinction worth being precise about:
 *
 *   met       already banked -- nothing can take it away
 *   on_track  the plan gets there, provided the student follows it
 *   at_risk   the plan does not get there
 *
 * "Met" deliberately means completed coursework only. A requirement satisfied
 * entirely by courses the student has merely *planned* is not met, because a
 * plan is a thing that changes -- and the moment it changes, a green checkmark
 * that had quietly been resting on a future course would be a lie.
 */

import type {
  Catalog,
  Course,
  CourseId,
  Plan,
  RequirementResult,
  RequirementRule,
} from "./types";

/**
 * Score every requirement against a plan.
 *
 * Takes the catalog and the rule set alongside the plan; the spec's
 * two-argument shape leaves no way to look up what a course is worth or what
 * the school actually demands.
 */
export function checkAll(
  plan: Plan,
  catalog: Catalog,
  rules: readonly RequirementRule[],
): RequirementResult[] {
  const completed = resolve(plan.completed.map((entry) => entry.courseId), catalog);

  // A course cannot be counted twice, and a course that is both completed and
  // sitting on the planning grid counts as completed.
  const completedIds = new Set(completed.map((course) => course.id));
  const planned = resolve(
    plan.placements.map((placement) => placement.courseId),
    catalog,
  ).filter((course) => !completedIds.has(course.id));

  return rules.map((rule) => score(rule, completed, planned));
}

/** Look course ids up, dropping unknown ones and duplicates. */
function resolve(ids: readonly CourseId[], catalog: Catalog): Course[] {
  const seen = new Set<CourseId>();
  const courses: Course[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const course = catalog.byId.get(id);
    if (course !== undefined) courses.push(course);
  }
  return courses;
}

function score(
  rule: RequirementRule,
  completed: readonly Course[],
  planned: readonly Course[],
): RequirementResult {
  const { earned, planned: plannedAmount, required } = measure(rule, completed, planned);

  const status: RequirementResult["status"] =
    earned >= required
      ? "met"
      : earned + plannedAmount >= required
        ? "on_track"
        : "at_risk";

  return { rule, earned, planned: plannedAmount, required, status };
}

function measure(
  rule: RequirementRule,
  completed: readonly Course[],
  planned: readonly Course[],
): { earned: number; planned: number; required: number } {
  switch (rule.kind) {
    case "credits_in_subject": {
      const inSubject = (course: Course) => course.subject === rule.subject;
      return {
        earned: creditsOf(completed.filter(inSubject)),
        planned: creditsOf(planned.filter(inSubject)),
        required: rule.credits,
      };
    }
    case "total_credits":
      return {
        earned: creditsOf(completed),
        planned: creditsOf(planned),
        required: rule.credits,
      };
    case "specific_course": {
      // Measured in courses, not credits: the school wants this one course,
      // and half of it is not a partial pass.
      const has = (courses: readonly Course[]) =>
        courses.some((course) => course.id === rule.courseId) ? 1 : 0;
      return { earned: has(completed), planned: has(planned), required: 1 };
    }
  }
}

function creditsOf(courses: readonly Course[]): number {
  const total = courses.reduce((sum, course) => sum + course.credits, 0);
  // Half-credit semester courses accumulate binary fraction error; a student
  // should never see "2.9999999 of 3 credits".
  return Math.round(total * 100) / 100;
}
