import { describe, expect, it } from "vitest";
import {
  CatalogCycleError,
  CatalogValidationError,
  assertNoCycles,
  buildCatalog,
  buildGraph,
  prereqEdgesOf,
} from "@/lib/solver/graph";
import {
  DANGLING_PREREQ,
  FULL_YEAR_STARTING_IN_TERM_2,
  LONG_STRICT_CYCLE,
  MIXED_CYCLE,
  MUTUAL_COREQUISITES,
  STRICT_CYCLE,
} from "./fixtures/invalid-catalogs";
import { FIXTURE_COURSES, fixtureGraph } from "./fixtures";

describe("buildCatalog", () => {
  it("accepts the fixture catalog", () => {
    const catalog = buildCatalog(FIXTURE_COURSES);
    expect(catalog.all.length).toBeGreaterThanOrEqual(30);
    expect(catalog.byId.get("ap-physics-c")?.title).toBe("AP Physics C");
  });

  it("rejects duplicate course ids", () => {
    const first = FIXTURE_COURSES[0]!;
    expect(() => buildCatalog([first, first])).toThrow(CatalogValidationError);
    expect(() => buildCatalog([first, first])).toThrow(/duplicate course id/i);
  });

  it("rejects a prerequisite that is not in the catalog", () => {
    expect(() => buildCatalog(DANGLING_PREREQ)).toThrow(/not in the catalog/i);
  });

  it("rejects a full-year course that claims to start in term 2", () => {
    expect(() => buildCatalog(FULL_YEAR_STARTING_IN_TERM_2)).toThrow(
      /full-year courses can only start in term 1/i,
    );
  });

  it("rejects a course listing itself as its own prerequisite", () => {
    const self = { ...FIXTURE_COURSES[0]!, prereq: { kind: "course" as const, courseId: FIXTURE_COURSES[0]!.id } };
    expect(() => buildCatalog([self])).toThrow(/itself as a prerequisite/i);
  });
});

describe("prereqEdgesOf", () => {
  it("labels plain requirements strict and co-requisites concurrent", () => {
    const physicsC = FIXTURE_COURSES.find((c) => c.id === "ap-physics-c")!;
    const edges = prereqEdgesOf(physicsC.id, physicsC.prereq);

    expect(edges).toContainEqual({ from: "ap-physics-c", to: "ap-physics-1", kind: "strict" });
    expect(edges).toContainEqual({ from: "ap-physics-c", to: "ap-calculus-ab", kind: "strict" });
    expect(edges).toContainEqual({ from: "ap-physics-c", to: "ap-calculus-ab", kind: "concurrent" });
  });
});

describe("directPrereqs / directDependents", () => {
  const graph = fixtureGraph();

  it("reports the courses a course directly requires", () => {
    expect(graph.directPrereqs("algebra-2")).toEqual(["geometry"]);
    expect(new Set(graph.directPrereqs("ap-chemistry"))).toEqual(
      new Set(["chemistry", "algebra-2"]),
    );
  });

  it("deduplicates a course named twice in one expression", () => {
    // AP Physics C names AP Calculus AB in both OR branches.
    expect(graph.directPrereqs("ap-physics-c")).toEqual(["ap-physics-1", "ap-calculus-ab"]);
  });

  it("reports the courses that directly require a course", () => {
    expect(new Set(graph.directDependents("algebra-2"))).toEqual(
      new Set(["precalculus", "ap-statistics", "ap-chemistry", "ap-physics-1", "ap-cs-a"]),
    );
  });

  it("returns nothing for a course with no prerequisites or dependents", () => {
    expect(graph.directPrereqs("biology")).toEqual([]);
    expect(graph.directDependents("ap-calculus-bc")).toEqual([]);
  });

  it("returns empty rather than throwing for an unknown course", () => {
    expect(graph.directPrereqs("not-a-course")).toEqual([]);
    expect(graph.directDependents("not-a-course")).toEqual([]);
  });
});

describe("cycle detection", () => {
  it("accepts the fixture catalog", () => {
    expect(() => assertNoCycles(buildCatalog(FIXTURE_COURSES))).not.toThrow();
  });

  it("rejects a two-course strict cycle", () => {
    expect(() => assertNoCycles(buildCatalog(STRICT_CYCLE))).toThrow(CatalogCycleError);
  });

  it("names the courses in the cycle so the catalog can be fixed", () => {
    // "Cycle detected" would be useless against a hundred-course catalog.
    let thrown: CatalogCycleError | undefined;
    try {
      assertNoCycles(buildCatalog(LONG_STRICT_CYCLE));
    } catch (error) {
      thrown = error as CatalogCycleError;
    }

    expect(thrown).toBeInstanceOf(CatalogCycleError);
    expect(thrown!.message).toMatch(/Alpha/);
    expect(thrown!.message).toMatch(/Beta/);
    expect(thrown!.message).toMatch(/Gamma/);
    expect(thrown!.cycle.length).toBeGreaterThanOrEqual(3);
    // A cycle is a closed loop: it comes back to where it started.
    expect(thrown!.cycle[0]).toBe(thrown!.cycle[thrown!.cycle.length - 1]);
  });

  it("allows mutual co-requisites", () => {
    // A lecture and its lab each require the other *at the same time*. That is
    // a pair of courses you sign up for together, not an impossible loop.
    expect(() => assertNoCycles(buildCatalog(MUTUAL_COREQUISITES))).not.toThrow();
  });

  it("rejects a loop that mixes a strict edge with a concurrent one", () => {
    // The case a naive "just ignore concurrent edges" check would wave through:
    // First must run alongside Second, but Second must follow First.
    expect(() => assertNoCycles(buildCatalog(MIXED_CYCLE))).toThrow(CatalogCycleError);
  });

  it("is enforced when the graph is built, not left to callers to remember", () => {
    expect(() => buildGraph(buildCatalog(STRICT_CYCLE))).toThrow(CatalogCycleError);
  });
});
