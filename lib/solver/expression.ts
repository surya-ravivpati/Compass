/**
 * Prerequisite expression evaluation.
 *
 * `evaluate` is deliberately dumb: it takes three sets of course ids and walks
 * the expression tree. All of the interval arithmetic -- who finishes before
 * whom, what counts as "at the same time" -- lives in `buildEvaluationSets`.
 *
 * Keeping those apart matters. The tree walk is the part that must obviously
 * match the catalog's intent, and it stays readable precisely because it never
 * has to think about terms.
 */

import type {
  Catalog,
  CourseId,
  DurationTerms,
  Plan,
  PrereqExpr,
  TermIndex,
} from "./types";
import { termIndex } from "./types";

export interface EvaluationSets {
  readonly completed: ReadonlySet<CourseId>;
  readonly plannedBefore: ReadonlySet<CourseId>;
  readonly plannedSame: ReadonlySet<CourseId>;
}

/**
 * Does `expr` hold, given what the student has completed and what sits before
 * / alongside the slot in question?
 *
 * Semantics are exactly as specified:
 *   course      -- in completed, or planned strictly before
 *   concurrent  -- planned at the same time
 *   and         -- every child
 *   or          -- at least one child
 *   none        -- always
 *
 * Note that `concurrent` is satisfied *only* by a same-time placement, not by
 * prior completion. A real co-requisite that a student may also have taken
 * earlier is therefore authored as `or(course X, concurrent X)`. That is a
 * catalog-authoring convention; it keeps this function matching the spec
 * exactly rather than quietly widening what `concurrent` means.
 */
export function evaluate(
  expr: PrereqExpr,
  completed: ReadonlySet<CourseId>,
  plannedBefore: ReadonlySet<CourseId>,
  plannedSame: ReadonlySet<CourseId>,
): boolean {
  switch (expr.kind) {
    case "none":
      return true;
    case "course":
      return completed.has(expr.courseId) || plannedBefore.has(expr.courseId);
    case "concurrent":
      return plannedSame.has(expr.courseId);
    // Empty `and` is true and empty `or` is false -- the standard identities.
    // Stated explicitly because an empty `or` silently flipping to true would
    // wave a student past a requirement they never met.
    case "and":
      return expr.children.every((child) =>
        evaluate(child, completed, plannedBefore, plannedSame),
      );
    case "or":
      return expr.children.some((child) =>
        evaluate(child, completed, plannedBefore, plannedSame),
      );
  }
}

/** The inclusive span of term indices a course occupies. */
export interface Occupancy {
  readonly start: TermIndex;
  readonly end: TermIndex;
}

export function occupancy(
  start: TermIndex,
  durationTerms: DurationTerms,
): Occupancy {
  return { start, end: start + durationTerms - 1 };
}

/**
 * Turn a plan into the three sets `evaluate` needs, as seen from one slot.
 *
 * `target` is the slot being judged -- both where it starts and how long it
 * runs, because a full-year course sitting "alongside" a spring semester
 * course really does overlap it.
 *
 *   plannedBefore  other finishes strictly before target starts
 *   plannedSame    the two occupancy spans overlap at all
 *
 * The target course is excluded from its own sets; nothing is its own
 * prerequisite.
 */
export function buildEvaluationSets(
  plan: Plan,
  catalog: Catalog,
  target: Occupancy,
  excludeCourseId?: CourseId,
): EvaluationSets {
  const completed = new Set<CourseId>(
    plan.completed.map((entry) => entry.courseId),
  );
  const plannedBefore = new Set<CourseId>();
  const plannedSame = new Set<CourseId>();

  for (const placement of plan.placements) {
    if (placement.courseId === excludeCourseId) continue;

    const course = catalog.byId.get(placement.courseId);
    if (course === undefined) continue;

    const span = occupancy(
      termIndex(placement.grade, placement.term),
      course.durationTerms,
    );

    if (span.end < target.start) {
      plannedBefore.add(placement.courseId);
    } else if (span.start <= target.end && target.start <= span.end) {
      plannedSame.add(placement.courseId);
    }
  }

  return { completed, plannedBefore, plannedSame };
}

/** Every course id mentioned anywhere in an expression tree. */
export function courseIdsIn(expr: PrereqExpr): CourseId[] {
  const found: CourseId[] = [];
  const walk = (node: PrereqExpr): void => {
    switch (node.kind) {
      case "course":
      case "concurrent":
        found.push(node.courseId);
        return;
      case "and":
      case "or":
        node.children.forEach(walk);
        return;
      case "none":
        return;
    }
  };
  walk(expr);
  return found;
}

/**
 * Render an expression the way a student would say it: "Chemistry and either
 * Physics or AP Physics 1". Used in the explanations attached to blocked and
 * unreachable courses, which are read by fifteen-year-olds.
 */
export function describePrereq(expr: PrereqExpr, catalog: Catalog): string {
  const title = (id: CourseId): string => catalog.byId.get(id)?.title ?? id;

  const render = (node: PrereqExpr): string => {
    switch (node.kind) {
      case "none":
        return "no prerequisites";
      case "course":
        return title(node.courseId);
      case "concurrent":
        return `${title(node.courseId)} at the same time`;
      case "and": {
        if (node.children.length === 0) return "no prerequisites";
        if (node.children.length === 1) return render(node.children[0]!);
        return joinWith(node.children.map(render), "and");
      }
      case "or": {
        if (node.children.length === 0) return "something impossible";
        if (node.children.length === 1) return render(node.children[0]!);
        return `either ${joinWith(node.children.map(render), "or")}`;
      }
    }
  };

  return render(expr);
}

function joinWith(parts: string[], conjunction: "and" | "or"): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} ${conjunction} ${parts[1]}`;
  const head = parts.slice(0, -1).join(", ");
  return `${head}, ${conjunction} ${parts[parts.length - 1]}`;
}
