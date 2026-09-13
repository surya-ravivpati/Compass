import { describe, expect, it } from "vitest";
import {
  backwardReachable,
  earliestStarts,
  latestStartTerms,
  latestStartYear,
  necessaryCourses,
  prereqViolations,
  strictlyRequired,
  unreachable,
} from "@/lib/solver/reachability";
import { gradeOfIndex } from "@/lib/solver/types";
import type { PrereqExpr } from "@/lib/solver/types";
import { at, fixtureGraph, planFor } from "./fixtures";

const graph = fixtureGraph();

const ENGINEERING = ["ap-physics-c", "ap-calculus-ab"];
const NURSING = ["ap-biology", "ap-chemistry"];
const UNDECIDED: string[] = [];

const reasonFor = (findings: { courseId: string; reason: string }[], id: string) =>
  findings.find((f) => f.courseId === id)?.reason ?? "";

describe("backwardReachable", () => {
  it("collects the whole chain behind a goal", () => {
    const reached = backwardReachable(graph, ["ap-calculus-ab"]);
    expect(reached).toContain("precalculus");
    expect(reached).toContain("algebra-2");
    expect(reached).toContain("geometry");
    expect(reached).toContain("algebra-1");
  });

  it("includes both sides of an OR, since either could serve", () => {
    const reached = backwardReachable(graph, ["ap-biology"]);
    expect(reached).toContain("chemistry");
    expect(reached).toContain("ap-chemistry");
  });

  it("does not wander into unrelated subjects", () => {
    const reached = backwardReachable(graph, ["ap-calculus-ab"]);
    expect(reached).not.toContain("ap-spanish");
    expect(reached).not.toContain("marching-band");
  });

  it("returns nothing for no goal", () => {
    expect(backwardReachable(graph, UNDECIDED).size).toBe(0);
  });
});

describe("necessaryCourses", () => {
  const course = (courseId: string): PrereqExpr => ({ kind: "course", courseId });
  const alongside = (courseId: string): PrereqExpr => ({ kind: "concurrent", courseId });

  it("takes the union across an AND", () => {
    const expr: PrereqExpr = { kind: "and", children: [course("a"), course("b")] };
    expect(necessaryCourses(expr)).toEqual(new Set(["a", "b"]));
  });

  it("takes the intersection across an OR, so alternatives are not required", () => {
    const expr: PrereqExpr = { kind: "or", children: [course("a"), course("b")] };
    expect(necessaryCourses(expr)).toEqual(new Set());
  });

  it("still requires a course offered as before-or-alongside", () => {
    // or(X, concurrent X) -- the student must take X; only the timing is open.
    const expr: PrereqExpr = { kind: "or", children: [course("a"), alongside("a")] };
    expect(necessaryCourses(expr)).toEqual(new Set(["a"]));
  });
});

describe("strictlyRequired", () => {
  it("is narrower than backward reachability", () => {
    const required = strictlyRequired(graph, ["ap-biology"]);
    expect(required).toContain("biology");
    // Either chemistry course opens AP Biology, so neither one is required.
    expect(required).not.toContain("chemistry");
    expect(required).not.toContain("ap-chemistry");
  });

  it("keeps a co-requisite that must be taken either way", () => {
    const required = strictlyRequired(graph, ["ap-physics-c"]);
    expect(required).toContain("ap-calculus-ab");
    expect(required).toContain("precalculus");
  });
});

describe("earliestStarts", () => {
  it("walks a clean chain forward one year at a time", () => {
    const solved = earliestStarts(planFor([]), graph);
    expect(gradeOfIndex(solved.startOf.get("geometry")!)).toBe(9);
    expect(gradeOfIndex(solved.startOf.get("algebra-2")!)).toBe(10);
    expect(gradeOfIndex(solved.startOf.get("precalculus")!)).toBe(11);
    expect(gradeOfIndex(solved.startOf.get("ap-calculus-ab")!)).toBe(12);
  });

  it("lets a semester course follow another inside a single year", () => {
    // Intro to CS in the fall, Engineering Design in the spring. A year-long
    // chain could not do this, which is the point of tracking terms.
    const solved = earliestStarts(planFor([]), graph);
    expect(solved.startOf.get("intro-to-cs")).toBe(0);
    expect(solved.startOf.get("engineering-design")).toBe(1);
  });

  it("pushes a year-long course past a semester prerequisite to the next fall", () => {
    // AP CS Principles runs all year, so it cannot start mid-year even though
    // Intro to CS finishes in December.
    const solved = earliestStarts(planFor([]), graph);
    expect(solved.startOf.get("ap-cs-principles")).toBe(2);
  });

  it("pins a placed course where the student put it", () => {
    const solved = earliestStarts(planFor([at("precalculus", 12)]), graph);
    // Grade 12 term 1 -- not the grade 11 it would reach on its own.
    expect(solved.startOf.get("precalculus")).toBe(6);
  });

  it("starts from the current grade for a student partway through", () => {
    const junior = planFor([], { currentGrade: 11, completed: [{ courseId: "algebra-1", grade: 8 }] });
    const solved = earliestStarts(junior, graph);
    expect(gradeOfIndex(solved.startOf.get("biology")!)).toBe(11);
  });
});

describe("unreachable", () => {
  it("flags only the genuinely impossible on an untouched plan", () => {
    // AP Calculus BC needs five years of math. A student who arrives having
    // done only Algebra 1 cannot get there, and Compass should say so on day
    // one rather than after three years of planning.
    const findings = unreachable(planFor([]), graph);
    expect(findings.map((f) => f.courseId)).toEqual(["ap-calculus-bc"]);
  });

  it("opens up once the student arrives further along", () => {
    const ahead = planFor([], {
      completed: [
        { courseId: "algebra-1", grade: 7 },
        { courseId: "geometry", grade: 8 },
      ],
    });
    expect(unreachable(ahead, graph)).toEqual([]);
  });

  describe("the defining interaction: dragging a course later", () => {
    // Precalculus in grade 11 leaves room for Calculus in grade 12, and for
    // AP Physics C alongside it. Moving Precalculus one year later should
    // visibly collapse that whole branch.
    const before = unreachable(planFor([at("precalculus", 11)]), graph);
    const after = unreachable(planFor([at("precalculus", 12)]), graph);

    it("leaves the chain intact beforehand", () => {
      expect(before.map((f) => f.courseId)).not.toContain("ap-calculus-ab");
      expect(before.map((f) => f.courseId)).not.toContain("ap-physics-c");
    });

    it("cascades downstream, not just to the immediate dependent", () => {
      const blocked = after.map((f) => f.courseId);
      expect(blocked).toContain("ap-calculus-ab");
      expect(blocked).toContain("ap-physics-c");
      expect(blocked).toContain("ap-calculus-bc");
    });

    it("explains the direct consequence by naming the course and the grade", () => {
      expect(reasonFor(after, "ap-calculus-ab")).toBe(
        "AP Calculus AB needs Precalculus finished first, but you have " +
          "Precalculus planned for grade 12. That leaves no room for " +
          "AP Calculus AB before you graduate.",
      );
    });

    it("explains the knock-on consequence by pointing at the real cause", () => {
      // AP Physics C did not fail because of anything the student did to it.
      // Saying so is the difference between a warning and an explanation.
      expect(reasonFor(after, "ap-physics-c")).toBe(
        "AP Physics C needs AP Calculus AB first, and AP Calculus AB no " +
          "longer fits in your plan either.",
      );
    });

    it("writes reasons a student can actually read", () => {
      for (const finding of after) {
        expect(finding.reason).toMatch(/^[A-Z]/);
        expect(finding.reason).toMatch(/\.$/);
        // No ids, no graph vocabulary.
        expect(finding.reason).not.toMatch(/-/);
        expect(finding.reason).not.toMatch(/prereq|constraint|node|edge|graph/i);
      }
    });
  });

  it("explains a chain that is merely too long without blaming a placement", () => {
    expect(reasonFor(unreachable(planFor([]), graph), "ap-calculus-bc")).toBe(
      "AP Calculus BC needs AP Calculus AB first. The earliest you could " +
        "start AP Calculus AB is grade 12, and there is not enough time left " +
        "after that for AP Calculus BC.",
    );
  });

  it("never reports a course the student already completed or placed", () => {
    const plan = planFor([at("precalculus", 12), at("ap-calculus-bc", 12)]);
    const blocked = unreachable(plan, graph).map((f) => f.courseId);
    expect(blocked).not.toContain("ap-calculus-bc");
    expect(blocked).not.toContain("algebra-1");
  });
});

describe("prereqViolations", () => {
  it("is quiet on a valid plan", () => {
    const plan = planFor([at("geometry", 9), at("algebra-2", 10), at("precalculus", 11)]);
    expect(prereqViolations(plan, graph)).toEqual([]);
  });

  it("flags a course placed before its prerequisites", () => {
    const plan = planFor([at("ap-calculus-ab", 9)]);
    const [violation] = prereqViolations(plan, graph);
    expect(violation?.courseId).toBe("ap-calculus-ab");
    expect(violation?.kind).toBe("prerequisite");
    expect(violation?.reason).toContain("Precalculus");
  });

  it("flags a course placed in a term it is not offered", () => {
    const plan = planFor([at("biology", 9, 2)]);
    const [violation] = prereqViolations(plan, graph);
    expect(violation?.kind).toBe("not_offered");
    expect(violation?.reason).toBe(
      "Biology runs the whole year, so it has to start in term 1.",
    );
  });

  it("accepts a prerequisite satisfied in the fall of the same year", () => {
    const plan = planFor([at("intro-to-cs", 10, 1), at("engineering-design", 10, 2)]);
    expect(prereqViolations(plan, graph)).toEqual([]);
  });

  it("rejects that same pair when they run at the same time", () => {
    const plan = planFor([at("intro-to-cs", 10, 1), at("engineering-design", 10, 1)]);
    expect(prereqViolations(plan, graph).map((v) => v.courseId)).toEqual([
      "engineering-design",
    ]);
  });

  it("accepts a co-requisite taken alongside", () => {
    // AP Physics C and AP Calculus AB in the same year is exactly what
    // or(course, concurrent) is for.
    const plan = planFor([
      at("geometry", 9), at("algebra-2", 10), at("precalculus", 11),
      at("biology", 9), at("physics", 10), at("ap-physics-1", 11),
      at("ap-calculus-ab", 12), at("ap-physics-c", 12),
    ]);
    expect(prereqViolations(plan, graph)).toEqual([]);
  });
});

describe("latestStartYear", () => {
  it("walks the deadline back down a chain, one year per course", () => {
    expect(latestStartYear("precalculus", graph, ENGINEERING)).toBe(11);
    expect(latestStartYear("algebra-2", graph, ENGINEERING)).toBe(10);
    expect(latestStartYear("geometry", graph, ENGINEERING)).toBe(9);
  });

  it("allows a co-requisite to run as late as the course that needs it", () => {
    // AP Calculus AB may be taken *alongside* AP Physics C, so its deadline is
    // grade 12, not grade 11. Treating every prerequisite as strict would push
    // this a year early and send the student chasing a deadline that is not real.
    expect(latestStartYear("ap-physics-c", graph, ENGINEERING)).toBe(12);
    expect(latestStartYear("ap-calculus-ab", graph, ENGINEERING)).toBe(12);
  });

  it("returns null when no year is early enough", () => {
    // Engineering requires Algebra 1 before high school. That is a real and
    // useful answer, not an error.
    expect(latestStartYear("algebra-1", graph, ENGINEERING)).toBeNull();
  });

  it("imposes no deadline at all without a goal", () => {
    for (const id of ["geometry", "algebra-2", "precalculus", "biology"]) {
      expect(latestStartYear(id, graph, UNDECIDED)).toBe(12);
    }
  });

  it("changes with the goal", () => {
    // Chemistry is optional for engineering but load-bearing for nursing.
    expect(latestStartYear("chemistry", graph, ENGINEERING)).toBe(12);
    expect(latestStartYear("chemistry", graph, NURSING)).toBe(11);
  });

  it("leaves a course outside the goal unconstrained", () => {
    expect(latestStartYear("ap-spanish", graph, ENGINEERING)).toBe(12);
  });

  it("computes every course in one pass", () => {
    const all = latestStartTerms(graph, ENGINEERING);
    expect(all.size).toBe(graph.catalog.all.length);
  });
});
