/**
 * Reachability: what a plan still makes possible, and what it has foreclosed.
 *
 * This is the file the product is built on. Everything a student sees on the
 * planner -- which courses are greyed out, how late a course can still be
 * started, why a chain no longer fits -- comes from here.
 *
 * Two distinct findings come out of it, and keeping them distinct matters:
 *
 *   a *violation*   the student placed a course somewhere its prerequisites
 *                   are not satisfied. They did that just now, and moving
 *                   things around fixes it.
 *   *unreachable*   the course can no longer fit anywhere in the time left.
 *                   An option has been closed off, not a rule broken.
 *
 * Different states, different colours, different fixes.
 */

import type {
  Course,
  CourseId,
  Grade,
  Plan,
  PrereqExpr,
  PrereqViolation,
  TermIndex,
  UnreachableCourse,
} from "./types";
import {
  LAST_TERM_INDEX,
  gradeOfIndex,
  horizonOf,
  termIndex,
  termOfIndex,
} from "./types";
import { buildEvaluationSets, describePrereq, evaluate, occupancy } from "./expression";
import type { CourseGraph } from "./graph";

/**
 * A term index that cannot be reached. Using Infinity rather than null means
 * the max/min arithmetic below composes without special cases: an unsatisfiable
 * AND branch poisons its parent, while an OR simply picks the finite option.
 */
const NEVER = Number.POSITIVE_INFINITY;

/* ------------------------------------------------------------------ *
 * Backward reachability
 * ------------------------------------------------------------------ */

/**
 * Every course that could transitively contribute to reaching these goals --
 * the union across OR branches.
 *
 * "Could contribute" is the right notion for the catalog rail: a student
 * looking at Chemistry should see it highlighted for a goal it can lead to,
 * even though AP Chemistry would serve equally well.
 */
export function backwardReachable(
  graph: CourseGraph,
  goalCourseIds: readonly CourseId[],
): Set<CourseId> {
  const reached = new Set<CourseId>();
  const queue = [...goalCourseIds];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reached.has(current)) continue;
    if (!graph.catalog.byId.has(current)) continue;
    reached.add(current);
    queue.push(...graph.directPrereqs(current));
  }

  return reached;
}

/**
 * The courses that appear in *every* way of satisfying an expression.
 *
 *   and  -- union of the children (all branches must hold)
 *   or   -- intersection (only what survives whichever branch is taken)
 *
 * So `or(Chemistry, AP Chemistry)` necessitates neither, while
 * `or(course X, concurrent X)` still necessitates X -- the student must take
 * it, the only open question is when.
 */
export function necessaryCourses(expr: PrereqExpr): Set<CourseId> {
  switch (expr.kind) {
    case "none":
      return new Set();
    case "course":
    case "concurrent":
      return new Set([expr.courseId]);
    case "and": {
      const union = new Set<CourseId>();
      for (const child of expr.children) {
        for (const id of necessaryCourses(child)) union.add(id);
      }
      return union;
    }
    case "or": {
      if (expr.children.length === 0) return new Set();
      const sets = expr.children.map(necessaryCourses);
      const [first, ...rest] = sets as [Set<CourseId>, ...Set<CourseId>[]];
      const intersection = new Set<CourseId>();
      for (const id of first) {
        if (rest.every((other) => other.has(id))) intersection.add(id);
      }
      return intersection;
    }
  }
}

/**
 * The courses a student genuinely must take to reach these goals.
 *
 * Narrower than `backwardReachable`, and the difference is what lets the right
 * rail say "required" honestly instead of over-claiming. For a goal reachable
 * through either Chemistry or AP Chemistry, neither is required.
 */
export function strictlyRequired(
  graph: CourseGraph,
  goalCourseIds: readonly CourseId[],
): Set<CourseId> {
  const required = new Set<CourseId>();
  const queue = [...goalCourseIds];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (required.has(current)) continue;
    const course = graph.catalog.byId.get(current);
    if (course === undefined) continue;
    required.add(current);
    queue.push(...necessaryCourses(course.prereq));
  }

  return required;
}

/* ------------------------------------------------------------------ *
 * Term-offering helpers
 * ------------------------------------------------------------------ */

/** Can `course` start at this term index and still finish by graduation? */
function canStartAt(course: Course, index: TermIndex): boolean {
  if (index < 0 || index > LAST_TERM_INDEX) return false;
  if (index + course.durationTerms - 1 > LAST_TERM_INDEX) return false;
  return course.termsOffered.includes(termOfIndex(index));
}

/** The earliest legal start at or after `minIndex`, or NEVER. */
function firstStartAtOrAfter(course: Course, minIndex: TermIndex): TermIndex {
  if (!Number.isFinite(minIndex)) return NEVER;
  for (let i = Math.max(minIndex, 0); i <= LAST_TERM_INDEX; i += 1) {
    if (canStartAt(course, i)) return i;
  }
  return NEVER;
}

/** The latest legal start at or before `maxIndex`, or null. */
function lastStartAtOrBefore(course: Course, maxIndex: TermIndex): TermIndex | null {
  const start = Math.min(maxIndex, LAST_TERM_INDEX);
  for (let i = start; i >= 0; i -= 1) {
    if (canStartAt(course, i)) return i;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Earliest possible start
 * ------------------------------------------------------------------ */

export interface EarliestStarts {
  /** Earliest term each course could start, or NEVER. */
  readonly startOf: ReadonlyMap<CourseId, TermIndex>;
  /** For each course, the prerequisite that pushed it latest (if any). */
  readonly blockedBy: ReadonlyMap<CourseId, CourseId>;
  readonly completed: ReadonlySet<CourseId>;
  readonly placedAt: ReadonlyMap<CourseId, TermIndex>;
}

/**
 * How early could each course possibly start, given this plan?
 *
 * The crucial rule is the second one: a course the student has already placed
 * is *pinned* to where they placed it. That single line is what makes the
 * product work. Dragging Precalculus from grade 11 to grade 12 re-pins it,
 * which pushes AP Calculus AB past graduation, which pushes AP Physics C out
 * with it -- the cascade falls out of the model rather than being special-cased
 * anywhere.
 */
export function earliestStarts(plan: Plan, graph: CourseGraph): EarliestStarts {
  const { catalog } = graph;
  const horizon = horizonOf(plan);

  const completed = new Set(plan.completed.map((entry) => entry.courseId));
  const placedAt = new Map<CourseId, TermIndex>();
  for (const placement of plan.placements) {
    placedAt.set(placement.courseId, termIndex(placement.grade, placement.term));
  }

  const startOf = new Map<CourseId, TermIndex>();
  const blockedBy = new Map<CourseId, CourseId>();
  const inProgress = new Set<CourseId>();

  /** Last term index a course occupies, or NEVER. -1 if already completed. */
  const finishOf = (courseId: CourseId): TermIndex => {
    if (completed.has(courseId)) return -1;
    const course = catalog.byId.get(courseId);
    if (course === undefined) return NEVER;
    const start = startFor(courseId);
    if (!Number.isFinite(start)) return NEVER;
    return start + course.durationTerms - 1;
  };

  /**
   * The earliest term at which `expr` can hold, plus which course set the pace.
   * `and` takes the slowest branch, `or` the fastest.
   */
  const satisfiedAt = (
    expr: PrereqExpr,
  ): { index: TermIndex; driver: CourseId | undefined } => {
    switch (expr.kind) {
      case "none":
        return { index: 0, driver: undefined };
      case "course":
        return { index: finishOf(expr.courseId) + 1, driver: expr.courseId };
      case "concurrent":
        return { index: startFor(expr.courseId), driver: expr.courseId };
      case "and": {
        let best = { index: 0, driver: undefined as CourseId | undefined };
        for (const child of expr.children) {
          const result = satisfiedAt(child);
          if (result.index > best.index) best = result;
        }
        return best;
      }
      case "or": {
        const [first, ...rest] = expr.children;
        if (first === undefined) return { index: NEVER, driver: undefined };
        // Seeded with the first branch rather than with NEVER, so that when
        // every branch is out of reach we still come back holding the course
        // that blocked it. Otherwise the explanation degrades to "no term
        // left" exactly when the student most needs to know what is in the way.
        let best = satisfiedAt(first);
        for (const child of rest) {
          const result = satisfiedAt(child);
          if (result.index < best.index) best = result;
        }
        return best;
      }
    }
  };

  function startFor(courseId: CourseId): TermIndex {
    const memo = startOf.get(courseId);
    if (memo !== undefined) return memo;

    const course = catalog.byId.get(courseId);
    if (course === undefined) return NEVER;

    if (completed.has(courseId)) {
      startOf.set(courseId, -course.durationTerms);
      return -course.durationTerms;
    }

    // Mutual co-requisites (a lecture and its lab each requiring the other at
    // the same time) are legal, so the recursion can genuinely come back
    // around. Re-entry contributes no constraint, which settles the pair at
    // the first term both can actually run.
    if (inProgress.has(courseId)) return 0;
    inProgress.add(courseId);

    let result: TermIndex;
    const pinned = placedAt.get(courseId);
    if (pinned !== undefined) {
      result = pinned;
      const { driver } = satisfiedAt(course.prereq);
      if (driver !== undefined) blockedBy.set(courseId, driver);
    } else {
      const { index, driver } = satisfiedAt(course.prereq);
      const earliestAllowed = Math.max(index, horizon.firstOpenTermIndex);
      result = firstStartAtOrAfter(course, earliestAllowed);
      if (driver !== undefined) blockedBy.set(courseId, driver);
    }

    inProgress.delete(courseId);
    startOf.set(courseId, result);
    return result;
  }

  for (const course of catalog.all) startFor(course.id);

  return { startOf, blockedBy, completed, placedAt };
}

/* ------------------------------------------------------------------ *
 * Unreachable courses
 * ------------------------------------------------------------------ */

/**
 * Which courses can no longer fit anywhere in the plan, and why.
 *
 * `reason` is shown directly to a fifteen-year-old, so it names real courses
 * and real grades. "Dependency constraint violated" would be a bug.
 *
 * Takes the plan rather than a separate graduation year -- the plan already
 * carries one, and two sources for the same fact is how they drift apart.
 */
export function unreachable(plan: Plan, graph: CourseGraph): UnreachableCourse[] {
  const { catalog } = graph;
  const solved = earliestStarts(plan, graph);
  const findings: UnreachableCourse[] = [];

  for (const course of catalog.all) {
    if (solved.completed.has(course.id)) continue;
    if (solved.placedAt.has(course.id)) continue;

    const start = solved.startOf.get(course.id) ?? NEVER;
    if (Number.isFinite(start) && start + course.durationTerms - 1 <= LAST_TERM_INDEX) {
      continue;
    }

    findings.push({
      courseId: course.id,
      reason: explainUnreachable(course, solved, graph),
    });
  }

  return findings;
}

function explainUnreachable(
  course: Course,
  solved: EarliestStarts,
  graph: CourseGraph,
): string {
  const { catalog } = graph;
  const title = (id: CourseId): string => catalog.byId.get(id)?.title ?? id;
  const blockerId = solved.blockedBy.get(course.id);

  // Nothing is in the way -- the plan simply has no term left that this
  // course runs in.
  if (blockerId === undefined) {
    return `There is no term left in your plan for ${course.title}.`;
  }

  const blockerTitle = title(blockerId);
  const blockerPlaced = solved.placedAt.get(blockerId);
  const blockerStart = solved.startOf.get(blockerId) ?? NEVER;

  // The most important case: the student just dragged the prerequisite later.
  if (blockerPlaced !== undefined) {
    return (
      `${course.title} needs ${blockerTitle} finished first, but you have ` +
      `${blockerTitle} planned for grade ${gradeOfIndex(blockerPlaced)}. ` +
      `That leaves no room for ${course.title} before you graduate.`
    );
  }

  // The prerequisite is itself already out of reach -- point at the root cause
  // rather than making the student chase the chain one course at a time.
  if (!Number.isFinite(blockerStart)) {
    return (
      `${course.title} needs ${blockerTitle} first, and ${blockerTitle} no ` +
      `longer fits in your plan either.`
    );
  }

  // The chain is simply too long for the years that remain.
  const blockerGrade = gradeOfIndex(blockerStart);
  return (
    `${course.title} needs ${blockerTitle} first. The earliest you could ` +
    `start ${blockerTitle} is grade ${blockerGrade}, and there is not enough ` +
    `time left after that for ${course.title}.`
  );
}

/* ------------------------------------------------------------------ *
 * Prerequisite violations
 * ------------------------------------------------------------------ */

/**
 * Courses the student has placed where they cannot legally go.
 *
 * Separate from `unreachable`: these are course placements that are wrong
 * right now and can be fixed by moving them.
 */
export function prereqViolations(plan: Plan, graph: CourseGraph): PrereqViolation[] {
  const { catalog } = graph;
  const violations: PrereqViolation[] = [];

  for (const placement of plan.placements) {
    const course = catalog.byId.get(placement.courseId);
    if (course === undefined) continue;

    const start = termIndex(placement.grade, placement.term);

    if (!canStartAt(course, start)) {
      const offered = course.termsOffered.map((term) => `term ${term}`).join(" or ");
      violations.push({
        courseId: course.id,
        grade: placement.grade,
        term: placement.term,
        kind: "not_offered",
        reason:
          course.durationTerms === 2
            ? `${course.title} runs the whole year, so it has to start in term 1.`
            : `${course.title} is only offered in ${offered}.`,
      });
      continue;
    }

    const span = occupancy(start, course.durationTerms);
    const sets = buildEvaluationSets(plan, catalog, span, course.id);

    if (!evaluate(course.prereq, sets.completed, sets.plannedBefore, sets.plannedSame)) {
      violations.push({
        courseId: course.id,
        grade: placement.grade,
        term: placement.term,
        kind: "prerequisite",
        reason:
          `${course.title} needs ${describePrereq(course.prereq, catalog)} ` +
          `before grade ${placement.grade}, and your plan does not have that yet.`,
      });
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ *
 * Latest possible start
 * ------------------------------------------------------------------ */

/**
 * The latest term each course could start while still leaving room for
 * everything the goal requires downstream of it.
 *
 * Deadlines are goal-relative by necessity. Measured against the whole
 * catalog the question is close to meaningless -- almost any course has some
 * four-deep dependent chain somewhere, which would stamp a grade 9 deadline on
 * courses the student has no intention of taking.
 *
 * Only *strictly required* prerequisites propagate a deadline. If a goal is
 * reachable through either Chemistry or AP Chemistry, neither one gets to
 * impose a date on the other's behalf.
 *
 * Where a course is required but the timing is flexible -- AP Calculus AB can
 * be taken before AP Physics C *or alongside it* -- the most permissive
 * reading wins, because taking it alongside is genuinely allowed.
 */
export function latestStartTerms(
  graph: CourseGraph,
  goalCourseIds: readonly CourseId[],
): Map<CourseId, TermIndex | null> {
  const { catalog } = graph;
  const required = strictlyRequired(graph, goalCourseIds);
  const result = new Map<CourseId, TermIndex | null>();
  const inProgress = new Set<CourseId>();

  const latestFor = (courseId: CourseId): TermIndex | null => {
    const memo = result.get(courseId);
    if (memo !== undefined) return memo;

    const course = catalog.byId.get(courseId);
    if (course === undefined) return null;

    if (inProgress.has(courseId)) return LAST_TERM_INDEX;
    inProgress.add(courseId);

    // With no downstream obligation, the only limit is graduation itself.
    let ceiling = LAST_TERM_INDEX - course.durationTerms + 1;

    for (const dependentId of graph.directDependents(courseId)) {
      if (!required.has(dependentId)) continue;

      const dependent = catalog.byId.get(dependentId);
      if (dependent === undefined) continue;
      if (!necessaryCourses(dependent.prereq).has(courseId)) continue;

      const dependentLatest = latestFor(dependentId);
      if (dependentLatest === null) {
        ceiling = -1;
        break;
      }

      // A course named in several ways by one dependent (before it, or
      // alongside it) takes the kindest of those readings.
      let permitted = -1;
      for (const edge of graph.prereqEdges(dependentId)) {
        if (edge.to !== courseId) continue;
        const limit =
          edge.kind === "strict"
            ? dependentLatest - course.durationTerms
            : dependentLatest + dependent.durationTerms - 1;
        if (limit > permitted) permitted = limit;
      }

      if (permitted < ceiling) ceiling = permitted;
    }

    const answer = ceiling < 0 ? null : lastStartAtOrBefore(course, ceiling);

    inProgress.delete(courseId);
    result.set(courseId, answer);
    return answer;
  };

  for (const course of catalog.all) latestFor(course.id);
  return result;
}

/**
 * The latest grade in which `courseId` could start and still leave room for
 * the goal. `null` means there is no late-enough slot -- the pathway does not
 * fit around this course.
 *
 * Note this takes the goal, which the spec's two-argument shape does not.
 * Without it the answer is not well defined; see the doc comment on
 * `latestStartTerms`.
 */
export function latestStartYear(
  courseId: CourseId,
  graph: CourseGraph,
  goalCourseIds: readonly CourseId[],
): Grade | null {
  const index = latestStartTerms(graph, goalCourseIds).get(courseId) ?? null;
  return index === null ? null : gradeOfIndex(index);
}
