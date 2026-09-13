import { describe, expect, it } from "vitest";
import {
  buildEvaluationSets,
  describePrereq,
  evaluate,
  occupancy,
} from "@/lib/solver/expression";
import type { PrereqExpr } from "@/lib/solver/types";
import { termIndex } from "@/lib/solver/types";
import { at, fixtureCatalog, planFor } from "./fixtures";

const set = (...ids: string[]) => new Set(ids);
const empty = new Set<string>();

const course = (courseId: string): PrereqExpr => ({ kind: "course", courseId });
const alongside = (courseId: string): PrereqExpr => ({ kind: "concurrent", courseId });
const and = (...children: PrereqExpr[]): PrereqExpr => ({ kind: "and", children });
const or = (...children: PrereqExpr[]): PrereqExpr => ({ kind: "or", children });
const none: PrereqExpr = { kind: "none" };

describe("evaluate", () => {
  it("treats a course with no prerequisites as always satisfied", () => {
    expect(evaluate(none, empty, empty, empty)).toBe(true);
  });

  describe("a single course requirement", () => {
    it("is satisfied by a completed course", () => {
      expect(evaluate(course("biology"), set("biology"), empty, empty)).toBe(true);
    });

    it("is satisfied by a course planned earlier", () => {
      expect(evaluate(course("biology"), empty, set("biology"), empty)).toBe(true);
    });

    it("is NOT satisfied by a course planned at the same time", () => {
      // The whole point of a prerequisite: it has to be finished first.
      expect(evaluate(course("biology"), empty, empty, set("biology"))).toBe(false);
    });

    it("is not satisfied when the course is absent entirely", () => {
      expect(evaluate(course("biology"), set("chemistry"), set("physics"), empty)).toBe(false);
    });
  });

  describe("a concurrent requirement", () => {
    it("is satisfied by a course planned at the same time", () => {
      expect(evaluate(alongside("ap-calculus-ab"), empty, empty, set("ap-calculus-ab"))).toBe(true);
    });

    it("is NOT satisfied by prior completion on its own", () => {
      // Per spec: `concurrent` means same-time only. Catalogs that also accept
      // prior completion say so explicitly with or(course X, concurrent X).
      expect(evaluate(alongside("ap-calculus-ab"), set("ap-calculus-ab"), empty, empty)).toBe(false);
      expect(evaluate(alongside("ap-calculus-ab"), empty, set("ap-calculus-ab"), empty)).toBe(false);
    });
  });

  describe("AND", () => {
    it("requires every child", () => {
      const expr = and(course("biology"), course("algebra-1"));
      expect(evaluate(expr, set("biology", "algebra-1"), empty, empty)).toBe(true);
      expect(evaluate(expr, set("biology"), empty, empty)).toBe(false);
      expect(evaluate(expr, set("algebra-1"), empty, empty)).toBe(false);
    });

    it("is true when empty", () => {
      expect(evaluate(and(), empty, empty, empty)).toBe(true);
    });
  });

  describe("OR", () => {
    it("requires at least one child", () => {
      const expr = or(course("chemistry"), course("ap-chemistry"));
      expect(evaluate(expr, set("chemistry"), empty, empty)).toBe(true);
      expect(evaluate(expr, set("ap-chemistry"), empty, empty)).toBe(true);
      expect(evaluate(expr, set("biology"), empty, empty)).toBe(false);
    });

    it("is false when empty", () => {
      // An empty OR quietly flipping to true would wave a student past a
      // requirement they never met.
      expect(evaluate(or(), empty, empty, empty)).toBe(false);
    });
  });

  describe("nested expressions", () => {
    const expr = and(course("biology"), or(course("chemistry"), course("ap-chemistry")));

    it("holds when the AND branch and one OR branch are satisfied", () => {
      expect(evaluate(expr, set("biology", "chemistry"), empty, empty)).toBe(true);
      expect(evaluate(expr, set("biology", "ap-chemistry"), empty, empty)).toBe(true);
    });

    it("fails when the OR branch has nothing satisfied", () => {
      expect(evaluate(expr, set("biology"), empty, empty)).toBe(false);
    });

    it("fails when the AND branch is missing even if the OR holds", () => {
      expect(evaluate(expr, set("chemistry"), empty, empty)).toBe(false);
    });

    it("mixes completed, earlier, and concurrent sources", () => {
      const mixed = and(course("ap-physics-1"), or(course("ap-calculus-ab"), alongside("ap-calculus-ab")));
      expect(evaluate(mixed, empty, set("ap-physics-1"), set("ap-calculus-ab"))).toBe(true);
      expect(evaluate(mixed, empty, set("ap-physics-1", "ap-calculus-ab"), empty)).toBe(true);
      expect(evaluate(mixed, empty, set("ap-physics-1"), empty)).toBe(false);
    });
  });
});

describe("buildEvaluationSets", () => {
  const catalog = fixtureCatalog();

  it("places a full-year course finished last year in plannedBefore", () => {
    const plan = planFor([at("biology", 9)]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(10, 1), 2));
    expect(sets.plannedBefore.has("biology")).toBe(true);
    expect(sets.plannedSame.has("biology")).toBe(false);
  });

  it("does NOT let a full-year course satisfy a prerequisite in its own spring", () => {
    // Grade 9 Biology runs all year; a course starting grade 9 term 2 overlaps
    // it rather than following it. This is the compression that term
    // granularity would otherwise allow.
    const plan = planFor([at("biology", 9, 1)]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(9, 2), 1));
    expect(sets.plannedBefore.has("biology")).toBe(false);
    expect(sets.plannedSame.has("biology")).toBe(true);
  });

  it("lets a fall semester course satisfy a spring course in the same year", () => {
    // And this is what term granularity buys: two semester courses chain
    // inside one year.
    const plan = planFor([at("intro-to-cs", 10, 1)]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(10, 2), 1));
    expect(sets.plannedBefore.has("intro-to-cs")).toBe(true);
  });

  it("counts an overlapping full-year course as concurrent", () => {
    const plan = planFor([at("ap-calculus-ab", 12, 1)]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(12, 1), 2));
    expect(sets.plannedSame.has("ap-calculus-ab")).toBe(true);
  });

  it("excludes the target course from its own sets", () => {
    const plan = planFor([at("biology", 9)]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(9, 1), 2), "biology");
    expect(sets.plannedSame.has("biology")).toBe(false);
    expect(sets.plannedBefore.has("biology")).toBe(false);
  });

  it("carries completed courses through unconditionally", () => {
    const plan = planFor([]);
    const sets = buildEvaluationSets(plan, catalog, occupancy(termIndex(9, 1), 2));
    expect(sets.completed.has("algebra-1")).toBe(true);
  });
});

describe("describePrereq", () => {
  const catalog = fixtureCatalog();

  it("names courses in plain language", () => {
    expect(describePrereq(course("ap-calculus-ab"), catalog)).toBe("AP Calculus AB");
  });

  it("renders an AND as a list", () => {
    const text = describePrereq(and(course("biology"), course("algebra-1")), catalog);
    expect(text).toBe("Biology and Algebra 1");
  });

  it("renders an OR with 'either'", () => {
    const text = describePrereq(or(course("chemistry"), course("ap-chemistry")), catalog);
    expect(text).toBe("either Chemistry or AP Chemistry");
  });

  it("marks a concurrent requirement as same-time", () => {
    expect(describePrereq(alongside("ap-calculus-ab"), catalog)).toBe(
      "AP Calculus AB at the same time",
    );
  });

  it("describes the real AP Physics C requirement readably", () => {
    const physicsC = catalog.byId.get("ap-physics-c");
    expect(physicsC).toBeDefined();
    expect(describePrereq(physicsC!.prereq, catalog)).toBe(
      "AP Physics 1 and either AP Calculus AB or AP Calculus AB at the same time",
    );
  });
});
