import { describe, expect, it } from "vitest";
import { checkAll } from "@/lib/solver/requirements";
import type { RequirementResult } from "@/lib/solver/types";
import { FIXTURE_REQUIREMENTS, at, fixtureCatalog, planFor } from "./fixtures";

const catalog = fixtureCatalog();

const check = (plan: Parameters<typeof checkAll>[0]) =>
  checkAll(plan, catalog, FIXTURE_REQUIREMENTS);

const find = (results: RequirementResult[], id: string): RequirementResult => {
  const found = results.find((result) => result.rule.id === id);
  expect(found, `no requirement "${id}"`).toBeDefined();
  return found!;
};

const completedCourses = (...ids: string[]) =>
  ids.map((courseId) => ({ courseId, grade: 9 }));

describe("checkAll", () => {
  it("returns one result per rule, in order", () => {
    const results = check(planFor([]));
    expect(results).toHaveLength(FIXTURE_REQUIREMENTS.length);
    expect(results.map((r) => r.rule.id)).toEqual(FIXTURE_REQUIREMENTS.map((r) => r.id));
  });

  describe("met", () => {
    it("is reached when completed coursework alone satisfies the rule", () => {
      const plan = planFor([], {
        completed: completedCourses("english-9", "english-10", "english-11", "ap-english-literature"),
      });
      const english = find(check(plan), "req-english");
      expect(english.earned).toBe(4);
      expect(english.status).toBe("met");
    });

    it("is NOT reached by planned courses alone, however many", () => {
      // A plan is a thing that changes. A green checkmark resting on a course
      // the student has merely pencilled in would be a lie the moment they
      // move it.
      const plan = planFor(
        [at("english-9", 9), at("english-10", 10), at("english-11", 11), at("ap-english-literature", 12)],
        { completed: [] },
      );
      const english = find(check(plan), "req-english");
      expect(english.earned).toBe(0);
      expect(english.planned).toBe(4);
      expect(english.status).toBe("on_track");
    });
  });

  describe("on_track", () => {
    it("counts completed and planned together", () => {
      const plan = planFor([at("english-11", 11), at("ap-english-literature", 12)], {
        completed: completedCourses("english-9", "english-10"),
      });
      const english = find(check(plan), "req-english");
      expect(english.earned).toBe(2);
      expect(english.planned).toBe(2);
      expect(english.status).toBe("on_track");
    });
  });

  describe("at_risk", () => {
    it("is reported when the plan still falls short", () => {
      const plan = planFor([at("english-11", 11)], {
        completed: completedCourses("english-9", "english-10"),
      });
      const english = find(check(plan), "req-english");
      expect(english.earned + english.planned).toBe(3);
      expect(english.required).toBe(4);
      expect(english.status).toBe("at_risk");
    });

    it("is the state of an untouched plan", () => {
      const results = check(planFor([]));
      expect(find(results, "req-english").status).toBe("at_risk");
      expect(find(results, "req-total").status).toBe("at_risk");
    });
  });

  describe("credit counting", () => {
    it("adds half-credit semester courses without float noise", () => {
      const plan = planFor([], {
        completed: completedCourses("health", "physical-education"),
      });
      const peHealth = find(check(plan), "req-pe-health");
      expect(peHealth.earned).toBe(1);
      expect(peHealth.status).toBe("met");
    });

    it("counts a course once even if it is both completed and placed", () => {
      const plan = planFor([at("english-9", 9)], {
        completed: completedCourses("english-9"),
      });
      const english = find(check(plan), "req-english");
      expect(english.earned).toBe(1);
      expect(english.planned).toBe(0);
    });

    it("counts a course once even if placed twice", () => {
      const plan = planFor([at("english-9", 9), at("english-9", 10)], { completed: [] });
      expect(find(check(plan), "req-english").planned).toBe(1);
    });

    it("ignores courses that are not in the catalog", () => {
      const plan = planFor([at("not-a-course", 9)], { completed: [] });
      expect(find(check(plan), "req-total").planned).toBe(0);
    });

    it("only counts courses in the rule's subject", () => {
      const plan = planFor([], { completed: completedCourses("biology", "english-9") });
      expect(find(check(plan), "req-science").earned).toBe(1);
      expect(find(check(plan), "req-english").earned).toBe(1);
      expect(find(check(plan), "req-total").earned).toBe(2);
    });
  });

  describe("a specific required course", () => {
    it("is at risk when the course appears nowhere", () => {
      expect(find(check(planFor([])), "req-health-course").status).toBe("at_risk");
    });

    it("is on track once it is planned", () => {
      const result = find(check(planFor([at("health", 10)])), "req-health-course");
      expect(result.planned).toBe(1);
      expect(result.status).toBe("on_track");
    });

    it("is met once it is completed", () => {
      const plan = planFor([], { completed: completedCourses("health") });
      expect(find(check(plan), "req-health-course").status).toBe("met");
    });

    it("is measured in courses, not credits", () => {
      // Health is a half-credit course, but half of a required course is not
      // a partial pass.
      const plan = planFor([], { completed: completedCourses("health") });
      const result = find(check(plan), "req-health-course");
      expect(result.earned).toBe(1);
      expect(result.required).toBe(1);
    });
  });
});
