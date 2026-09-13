/**
 * Seed data validation.
 *
 * The catalog is part of the product, and a wrong catalog is worse than a
 * missing one: it produces confident, specific, incorrect advice about a
 * student's graduation. So every check here is fatal rather than a warning,
 * and the seed script runs all of them before it writes a single row.
 *
 * The same checks run in the test suite (tests/db/seed.test.ts), so a bad
 * catalog cannot reach main in the first place.
 */

import { buildCatalog, buildGraph } from "@/lib/solver/graph";
import { earliestStarts } from "@/lib/solver/reachability";
import { LAST_TERM_INDEX } from "@/lib/solver/types";
import type { Catalog, Course, Plan } from "@/lib/solver/types";
import {
  assertReferencesResolve,
  clubListSchema,
  courseListSchema,
  pathwayListSchema,
  requirementListSchema,
} from "@/validation/catalog";
import { SEED_COURSES, SEED_PATHWAYS, SEED_REQUIREMENTS } from "./catalog";
import { SEED_CLUBS } from "./clubs";

export class SeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedValidationError";
  }
}

export interface SeedValidationReport {
  readonly catalog: Catalog;
  readonly courseCount: number;
  readonly clubCount: number;
  /**
   * Courses a student entering grade 9 with nothing completed could not
   * reach. Reported rather than rejected -- a catalog where everything fits
   * from a standing start would be a catalog with no long chains in it, which
   * is to say no reason for this product to exist.
   */
  readonly unreachableFromScratch: readonly string[];
}

/**
 * Run every check. Throws on the first failure, with a message that says what
 * to fix rather than merely that something is wrong.
 */
export function validateSeedData(): SeedValidationReport {
  // 1. Shape. These are the checks TypeScript cannot make once the data has
  //    been through JSON, which is how it reaches the solver in production.
  courseListSchema.parse(SEED_COURSES);
  clubListSchema.parse(SEED_CLUBS);
  pathwayListSchema.parse(SEED_PATHWAYS);
  requirementListSchema.parse(SEED_REQUIREMENTS);

  // 2. Structure: duplicate ids, dangling prerequisites, full-year courses
  //    claiming a spring start. buildCatalog throws on all of these.
  const catalog = buildCatalog(SEED_COURSES);

  // 3. Cycles. buildGraph refuses a catalog where a course transitively
  //    requires itself, and names the loop.
  const graph = buildGraph(catalog);

  // 4. Cross-references that individually-valid records can still get wrong.
  assertReferencesResolve(SEED_COURSES, SEED_PATHWAYS, SEED_REQUIREMENTS);

  assertUniqueIds(SEED_CLUBS.map((club) => club.id), "club");
  assertUniqueIds(SEED_PATHWAYS.map((pathway) => pathway.id), "pathway");
  assertUniqueIds(SEED_REQUIREMENTS.map((rule) => rule.id), "requirement");
  assertUniqueIds(SEED_COURSES.map((course) => course.code), "course code");

  for (const club of SEED_CLUBS) {
    if (club.meetings.length === 0) continue;
    const hours =
      club.meetings.reduce((sum, m) => sum + (m.endMinute - m.startMinute), 0) / 60;
    if (hours > club.weeklyHours + 0.01) {
      throw new SeedValidationError(
        `Club "${club.id}" lists ${club.weeklyHours} weekly hours but its ` +
          `meetings already account for ${hours}. The hours figure should ` +
          `cover at least the scheduled meetings.`,
      );
    }
  }

  // 5. Every pathway must be completable by somebody. A goal course that no
  //    student could ever reach is a data bug, not a hard pathway -- and it
  //    would quietly render that whole option dead in the UI.
  const startedEarly = baselinePlan(["algebra-1"]);
  const solved = earliestStarts(startedEarly, graph);

  for (const pathway of SEED_PATHWAYS) {
    for (const goalId of pathway.goalCourseIds) {
      const course = catalog.byId.get(goalId);
      if (course === undefined) continue;
      if (!fitsBeforeGraduation(course, solved.startOf.get(goalId))) {
        throw new SeedValidationError(
          `Pathway "${pathway.id}" requires "${goalId}", which no student can ` +
            `reach in four years even having completed Algebra 1 beforehand. ` +
            `Either the prerequisite chain is too long or it is wrong.`,
        );
      }
    }
  }

  const fromScratch = earliestStarts(baselinePlan([]), graph);
  const unreachableFromScratch = catalog.all
    .filter((course) => !fitsBeforeGraduation(course, fromScratch.startOf.get(course.id)))
    .map((course) => course.id);

  return {
    catalog,
    courseCount: SEED_COURSES.length,
    clubCount: SEED_CLUBS.length,
    unreachableFromScratch,
  };
}

function fitsBeforeGraduation(course: Course, start: number | undefined): boolean {
  if (start === undefined || !Number.isFinite(start)) return false;
  return start + course.durationTerms - 1 <= LAST_TERM_INDEX;
}

/** A grade 9 student with the given courses behind them and an empty plan. */
function baselinePlan(completedIds: readonly string[]): Plan {
  return {
    gradYear: 2030,
    currentGrade: 9,
    completed: completedIds.map((courseId) => ({ courseId, grade: 8 })),
    placements: [],
  };
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new SeedValidationError(`Duplicate ${label} "${id}".`);
    }
    seen.add(id);
  }
}
