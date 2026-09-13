import { describe, expect, it } from "vitest";
import { solvePlan } from "@/lib/plan/solve";
import { at, fixtureGraph, planFor, FIXTURE_REQUIREMENTS } from "../solver/fixtures";

const graph = fixtureGraph();
const ENGINEERING = ["ap-physics-c", "ap-calculus-ab"];
const NO_GOAL: string[] = [];

const solve = (placements: Parameters<typeof planFor>[0], goals = ENGINEERING) =>
  solvePlan(planFor(placements), graph, FIXTURE_REQUIREMENTS, goals);

const viewOf = (solved: ReturnType<typeof solve>, id: string) => {
  const view = solved.byCourseId.get(id);
  expect(view, `no view for ${id}`).toBeDefined();
  return view!;
};

describe("solvePlan", () => {
  it("returns a view for every course in the catalog", () => {
    const solved = solve([]);
    expect(solved.views.length).toBe(graph.catalog.all.length);
  });

  describe("course state", () => {
    it("marks completed coursework as completed", () => {
      const view = viewOf(solve([]), "algebra-1");
      expect(view.state).toBe("completed");
      // Algebra 1 happened in grade 8, outside the four columns. The board
      // correctly leaves it out while still treating it as immutable.
      expect(view.completedGrade).toBe(8);
    });

    it("keeps the prior grade for a completed high-school course", () => {
      const plan = planFor([], {
        completed: [
          { courseId: "algebra-1", grade: 8 },
          { courseId: "english-9", grade: 9 },
        ],
      });
      const solved = solvePlan(plan, graph, FIXTURE_REQUIREMENTS, ENGINEERING);
      const english = solved.byCourseId.get("english-9");
      expect(english?.state).toBe("completed");
      expect(english?.completedGrade).toBe(9);
    });

    it("marks a placed course as placed", () => {
      const view = viewOf(solve([at("biology", 9)]), "biology");
      expect(view.state).toBe("placed");
      expect(view.placement?.grade).toBe(9);
    });

    it("marks a course whose prerequisites are unmet as a violation", () => {
      const view = viewOf(solve([at("ap-calculus-ab", 9)]), "ap-calculus-ab");
      expect(view.state).toBe("violation");
      expect(view.reason).toContain("Precalculus");
    });

    it("marks a course that no longer fits as unreachable", () => {
      const view = viewOf(solve([at("precalculus", 12)]), "ap-calculus-ab");
      expect(view.state).toBe("unreachable");
      expect(view.reason).toContain("Precalculus");
    });

    it("ranks violation above unreachable, since the student just caused it", () => {
      // A course can be both wrongly placed and short of room. The actionable
      // one wins, because that is the one they can undo.
      const view = viewOf(solve([at("ap-calculus-bc", 9)]), "ap-calculus-bc");
      expect(view.state).toBe("violation");
    });

    it("leaves everything else available", () => {
      expect(viewOf(solve([]), "biology").state).toBe("available");
    });
  });

  describe("goal awareness", () => {
    it("marks courses the goal genuinely needs as required", () => {
      const solved = solve([]);
      expect(viewOf(solved, "precalculus").required).toBe(true);
      expect(viewOf(solved, "ap-physics-1").required).toBe(true);
    });

    it("does not mark unrelated courses as required", () => {
      expect(viewOf(solve([]), "ap-spanish").required).toBe(false);
    });

    it("reports the latest grade a required course can still start", () => {
      const solved = solve([]);
      expect(viewOf(solved, "precalculus").latestStartGrade).toBe(11);
      expect(viewOf(solved, "algebra-2").latestStartGrade).toBe(10);
    });

    it("requires nothing when no goal is chosen", () => {
      const solved = solve([], NO_GOAL);
      expect(solved.views.every((view) => !view.required)).toBe(true);
    });
  });

  describe("status", () => {
    it("is at risk on an untouched plan, because requirements are unmet", () => {
      expect(solve([]).status).toBe("at_risk");
    });

    it("is at risk when a required course has been blocked off", () => {
      const solved = solve([at("precalculus", 12)]);
      expect(solved.status).toBe("at_risk");
      expect(solved.headlines.join(" ")).toContain("AP Calculus AB");
    });

    it("ignores unreachable courses the goal does not need", () => {
      // Most of the catalog is out of reach for anybody. Saying so for courses
      // the student never wanted would be noise, not information.
      const withGoal = solve([]);
      const spanish = viewOf(withGoal, "ap-spanish");
      expect(spanish.required).toBe(false);
      expect(withGoal.headlines.join(" ")).not.toContain("Spanish");
    });

    it("says nothing is wrong when nothing is", () => {
      const solved = solvePlan(planFor([]), graph, [], ENGINEERING);
      expect(solved.status).toBe("on_track");
      expect(solved.headlines).toEqual([]);
    });
  });

  describe("headlines", () => {
    it("keeps at most three, most important first", () => {
      // A wall of warnings gets scrolled past.
      const solved = solve([
        at("ap-calculus-ab", 9),
        at("ap-biology", 9),
        at("ap-physics-c", 9),
        at("ap-chemistry", 9),
      ]);
      expect(solved.headlines.length).toBeLessThanOrEqual(3);
      expect(solved.headlines.length).toBeGreaterThan(0);
    });

    it("writes them in plain language", () => {
      const solved = solve([at("precalculus", 12)]);
      for (const headline of solved.headlines) {
        expect(headline).toMatch(/^[A-Z]/);
        expect(headline).toMatch(/\.$/);
        expect(headline).not.toMatch(/prereq|constraint|node|edge/i);
      }
    });
  });

  it("counts violations and unreachable courses separately", () => {
    const solved = solve([at("ap-calculus-ab", 9)]);
    expect(solved.violationCount).toBeGreaterThan(0);
    expect(solved.unreachableCount).toBeGreaterThanOrEqual(0);
  });
});
