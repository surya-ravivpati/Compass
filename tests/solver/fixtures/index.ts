import { buildCatalog, buildGraph } from "@/lib/solver/graph";
import type { CourseGraph } from "@/lib/solver/graph";
import type { Catalog, Grade, Placement, Plan, Term } from "@/lib/solver/types";
import { FIXTURE_COURSES } from "./catalog";

export * from "./catalog";
export * from "./pathways";
export * from "./requirements";
export * from "./clubs";

let cachedCatalog: Catalog | undefined;
let cachedGraph: CourseGraph | undefined;

export function fixtureCatalog(): Catalog {
  cachedCatalog ??= buildCatalog(FIXTURE_COURSES);
  return cachedCatalog;
}

export function fixtureGraph(): CourseGraph {
  cachedGraph ??= buildGraph(fixtureCatalog());
  return cachedGraph;
}

/** `at("ap-biology", 11)` -> a term-1 placement in grade 11. */
export function at(courseId: string, grade: Grade, term: Term = 1): Placement {
  return { courseId, grade, term };
}

/**
 * A plan for a student entering grade 9 who finished Algebra 1 in 8th grade --
 * the ordinary starting point for anyone aiming at calculus, and the one the
 * chains in the fixture catalog are calibrated against.
 */
export function planFor(
  placements: readonly Placement[],
  overrides: Partial<Plan> = {},
): Plan {
  return {
    gradYear: 2030,
    currentGrade: 9,
    completed: [{ courseId: "algebra-1", grade: 8 }],
    placements,
    ...overrides,
  };
}
