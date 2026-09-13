/**
 * The course dependency graph: catalog validation, prerequisite/dependent
 * lookups, and cycle detection.
 *
 * A cycle in a course catalog is not a situation to route around -- it means
 * the catalog itself is wrong (some course transitively requires itself, which
 * no student could ever satisfy). Everything here fails loudly rather than
 * degrading, because a quietly-tolerated cycle would make the reachability
 * pass non-terminating or, worse, subtly wrong.
 */

import type { Catalog, Course, CourseId, Term } from "./types";
import { courseIdsIn } from "./expression";
import type { PrereqExpr } from "./types";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

export class CatalogCycleError extends CatalogValidationError {
  readonly cycle: readonly CourseId[];

  constructor(message: string, cycle: readonly CourseId[]) {
    super(message);
    this.name = "CatalogCycleError";
    this.cycle = cycle;
  }
}

/* ------------------------------------------------------------------ *
 * Catalog construction
 * ------------------------------------------------------------------ */

/**
 * Index a list of courses into a Catalog, rejecting anything structurally
 * invalid. Does not check for cycles -- that is `assertNoCycles`, which
 * `buildGraph` runs for you.
 */
export function buildCatalog(courses: readonly Course[]): Catalog {
  const byId = new Map<CourseId, Course>();

  for (const course of courses) {
    if (byId.has(course.id)) {
      throw new CatalogValidationError(`Duplicate course id "${course.id}".`);
    }
    byId.set(course.id, course);
  }

  for (const course of courses) {
    if (course.termsOffered.length === 0) {
      throw new CatalogValidationError(
        `Course "${course.id}" is offered in no terms.`,
      );
    }

    // A full-year course started in term 2 would run past the end of the year.
    if (course.durationTerms === 2) {
      const illegal = course.termsOffered.filter((term: Term) => term !== 1);
      if (illegal.length > 0) {
        throw new CatalogValidationError(
          `Course "${course.id}" runs a full year but is listed as starting in ` +
            `term ${illegal.join(", ")}. Full-year courses can only start in term 1.`,
        );
      }
    }

    if (course.credits < 0) {
      throw new CatalogValidationError(
        `Course "${course.id}" has negative credits.`,
      );
    }

    for (const referenced of courseIdsIn(course.prereq)) {
      if (!byId.has(referenced)) {
        throw new CatalogValidationError(
          `Course "${course.id}" lists prerequisite "${referenced}", which is not in the catalog.`,
        );
      }
      if (referenced === course.id) {
        throw new CatalogValidationError(
          `Course "${course.id}" lists itself as a prerequisite.`,
        );
      }
    }
  }

  return { all: courses, byId };
}

/* ------------------------------------------------------------------ *
 * Edges
 * ------------------------------------------------------------------ */

/**
 * `strict` -- the prerequisite must *finish* before this course starts.
 * `concurrent` -- the prerequisite must run *at the same time*.
 *
 * The distinction matters for cycle detection: two courses may legitimately
 * be mutual co-requisites (take them together), but neither can strictly
 * precede the other in a loop.
 */
export type PrereqEdgeKind = "strict" | "concurrent";

export interface PrereqEdge {
  /** The course that has the requirement. */
  readonly from: CourseId;
  /** The course being required. */
  readonly to: CourseId;
  readonly kind: PrereqEdgeKind;
}

/** Direct prerequisite edges of one expression, with their kinds. */
export function prereqEdgesOf(
  courseId: CourseId,
  expr: PrereqExpr,
): PrereqEdge[] {
  const edges: PrereqEdge[] = [];
  const walk = (node: PrereqExpr): void => {
    switch (node.kind) {
      case "course":
        edges.push({ from: courseId, to: node.courseId, kind: "strict" });
        return;
      case "concurrent":
        edges.push({ from: courseId, to: node.courseId, kind: "concurrent" });
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
  return edges;
}

/* ------------------------------------------------------------------ *
 * Graph
 * ------------------------------------------------------------------ */

export interface CourseGraph {
  readonly catalog: Catalog;
  /** Courses directly required by `courseId` (both strict and concurrent). */
  directPrereqs(courseId: CourseId): readonly CourseId[];
  /** Courses that directly require `courseId`. */
  directDependents(courseId: CourseId): readonly CourseId[];
  /** Every direct prerequisite edge of `courseId`, with kinds. */
  prereqEdges(courseId: CourseId): readonly PrereqEdge[];
}

/**
 * Build the graph, validating that it is acyclic.
 *
 * Cycle validation happens here rather than being left to callers, because
 * every reachability calculation downstream assumes termination. Making that
 * assumption checkable-but-optional is how it eventually goes unchecked.
 */
export function buildGraph(catalog: Catalog): CourseGraph {
  assertNoCycles(catalog);

  const prereqs = new Map<CourseId, CourseId[]>();
  const dependents = new Map<CourseId, CourseId[]>();
  const edges = new Map<CourseId, PrereqEdge[]>();

  for (const course of catalog.all) {
    prereqs.set(course.id, []);
    dependents.set(course.id, []);
    edges.set(course.id, []);
  }

  for (const course of catalog.all) {
    const courseEdges = prereqEdgesOf(course.id, course.prereq);
    edges.set(course.id, courseEdges);

    const seen = new Set<CourseId>();
    for (const edge of courseEdges) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      prereqs.get(course.id)!.push(edge.to);
      dependents.get(edge.to)!.push(course.id);
    }
  }

  return {
    catalog,
    directPrereqs: (courseId) => prereqs.get(courseId) ?? [],
    directDependents: (courseId) => dependents.get(courseId) ?? [],
    prereqEdges: (courseId) => edges.get(courseId) ?? [],
  };
}

/* ------------------------------------------------------------------ *
 * Cycle detection
 * ------------------------------------------------------------------ */

/**
 * Throw if the catalog contains an impossible prerequisite loop.
 *
 * Implemented with Tarjan's strongly-connected-components algorithm rather
 * than a plain DFS back-edge check, because the rule is subtler than
 * "is there a loop":
 *
 *   A requires B, B requires A                 -- impossible (strict loop)
 *   A alongside B, B alongside A               -- fine (mutual co-requisites)
 *   A requires B, B alongside A                -- impossible (mixed loop)
 *
 * Within a strongly-connected component every course transitively reaches
 * every other, so a single strict edge inside one means some course must
 * finish strictly before itself. A component wired only by concurrent edges
 * is just a group of courses taken together, which is legal.
 */
export function assertNoCycles(catalog: Catalog): void {
  const allEdges = new Map<CourseId, PrereqEdge[]>();
  for (const course of catalog.all) {
    allEdges.set(course.id, prereqEdgesOf(course.id, course.prereq));
  }

  const index = new Map<CourseId, number>();
  const lowlink = new Map<CourseId, number>();
  const onStack = new Set<CourseId>();
  const stack: CourseId[] = [];
  let counter = 0;

  const components: CourseId[][] = [];

  // Iterative Tarjan: a deep prerequisite chain should not blow the JS stack.
  const strongConnect = (root: CourseId): void => {
    type Frame = { node: CourseId; edgeIndex: number };
    const frames: Frame[] = [{ node: root, edgeIndex: 0 }];

    index.set(root, counter);
    lowlink.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const neighbours = allEdges.get(frame.node) ?? [];

      if (frame.edgeIndex < neighbours.length) {
        const next = neighbours[frame.edgeIndex]!.to;
        frame.edgeIndex += 1;

        if (!index.has(next)) {
          index.set(next, counter);
          lowlink.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          frames.push({ node: next, edgeIndex: 0 });
        } else if (onStack.has(next)) {
          lowlink.set(
            frame.node,
            Math.min(lowlink.get(frame.node)!, index.get(next)!),
          );
        }
        continue;
      }

      frames.pop();

      if (frames.length > 0) {
        const parent = frames[frames.length - 1]!;
        lowlink.set(
          parent.node,
          Math.min(lowlink.get(parent.node)!, lowlink.get(frame.node)!),
        );
      }

      if (lowlink.get(frame.node) === index.get(frame.node)) {
        const component: CourseId[] = [];
        for (;;) {
          const member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
          if (member === frame.node) break;
        }
        components.push(component);
      }
    }
  };

  for (const course of catalog.all) {
    if (!index.has(course.id)) strongConnect(course.id);
  }

  for (const component of components) {
    if (component.length < 2) continue;

    const members = new Set(component);
    const offending = component
      .flatMap((id) => allEdges.get(id) ?? [])
      .find((edge) => edge.kind === "strict" && members.has(edge.to));

    if (offending !== undefined) {
      const cycle = shortestCycleThrough(offending, allEdges, members);
      throw new CatalogCycleError(
        `Prerequisite cycle in catalog: ${describeCycle(cycle, catalog)}. ` +
          `A course cannot transitively require itself.`,
        cycle,
      );
    }
  }
}

/**
 * Walk back from the strict edge's target to its source to recover a concrete
 * loop. A named path ("Algebra 2 -> Precalculus -> Algebra 2") is the whole
 * point of the error; "cycle detected" would be useless against a hundred-course
 * catalog.
 */
function shortestCycleThrough(
  edge: PrereqEdge,
  allEdges: ReadonlyMap<CourseId, readonly PrereqEdge[]>,
  members: ReadonlySet<CourseId>,
): CourseId[] {
  const cameFrom = new Map<CourseId, CourseId>();
  const queue: CourseId[] = [edge.to];
  const seen = new Set<CourseId>([edge.to]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === edge.from) break;

    for (const next of allEdges.get(current) ?? []) {
      if (!members.has(next.to) || seen.has(next.to)) continue;
      seen.add(next.to);
      cameFrom.set(next.to, current);
      queue.push(next.to);
    }
  }

  const path: CourseId[] = [];
  let cursor: CourseId | undefined = edge.from;
  while (cursor !== undefined) {
    path.push(cursor);
    if (cursor === edge.to) break;
    cursor = cameFrom.get(cursor);
  }

  // `path` now runs from the strict edge's target back to its source. Adding
  // the source at the front closes the loop, so the result reads as a cycle:
  // "Alpha requires Beta requires Gamma requires Alpha".
  path.reverse();
  path.unshift(edge.from);
  return path;
}

function describeCycle(cycle: readonly CourseId[], catalog: Catalog): string {
  return cycle
    .map((id) => catalog.byId.get(id)?.title ?? id)
    .join(" requires ");
}
