import { describe, expect, it } from "vitest";
import {
  assertReferencesResolve,
  clubListSchema,
  courseListSchema,
  pathwayListSchema,
  prereqExprSchema,
  requirementListSchema,
} from "@/validation/catalog";
import {
  FIXTURE_CLUBS,
  FIXTURE_COURSES,
  FIXTURE_PATHWAYS,
  FIXTURE_REQUIREMENTS,
} from "./fixtures";

describe("the fixture data is internally consistent", () => {
  it("has courses that validate", () => {
    expect(() => courseListSchema.parse(FIXTURE_COURSES)).not.toThrow();
  });

  it("has clubs that validate", () => {
    expect(() => clubListSchema.parse(FIXTURE_CLUBS)).not.toThrow();
  });

  it("has pathways and requirements that validate", () => {
    expect(() => pathwayListSchema.parse(FIXTURE_PATHWAYS)).not.toThrow();
    expect(() => requirementListSchema.parse(FIXTURE_REQUIREMENTS)).not.toThrow();
  });

  it("has no pathway or requirement pointing at a course that does not exist", () => {
    expect(() =>
      assertReferencesResolve(FIXTURE_COURSES, FIXTURE_PATHWAYS, FIXTURE_REQUIREMENTS),
    ).not.toThrow();
  });
});

describe("prereqExprSchema", () => {
  it("accepts a deeply nested expression", () => {
    const expr = {
      kind: "and",
      children: [
        { kind: "course", courseId: "biology" },
        {
          kind: "or",
          children: [
            { kind: "course", courseId: "chemistry" },
            { kind: "concurrent", courseId: "ap-chemistry" },
          ],
        },
      ],
    };
    expect(() => prereqExprSchema.parse(expr)).not.toThrow();
  });

  it("rejects an unknown node kind", () => {
    expect(() => prereqExprSchema.parse({ kind: "maybe", courseId: "x" })).toThrow();
  });

  it("rejects a course node with no id", () => {
    expect(() => prereqExprSchema.parse({ kind: "course" })).toThrow();
    expect(() => prereqExprSchema.parse({ kind: "course", courseId: "" })).toThrow();
  });

  it("rejects an empty OR", () => {
    // An empty OR is unsatisfiable -- it would quietly make a course
    // impossible for every student, without ever throwing.
    expect(() => prereqExprSchema.parse({ kind: "or", children: [] })).toThrow();
  });

  it("rejects a malformed child several levels down", () => {
    const expr = {
      kind: "and",
      children: [
        { kind: "course", courseId: "biology" },
        { kind: "or", children: [{ kind: "course", courseId: 42 }] },
      ],
    };
    expect(() => prereqExprSchema.parse(expr)).toThrow();
  });
});

describe("assertReferencesResolve", () => {
  const courses = [{ id: "biology" }];

  it("catches a pathway naming a course that does not exist", () => {
    expect(() =>
      assertReferencesResolve(
        courses,
        [{ id: "nursing", goalCourseIds: ["ap-biology"] }],
        [],
      ),
    ).toThrow(/ap-biology/);
  });

  it("catches a requirement naming a course that does not exist", () => {
    expect(() =>
      assertReferencesResolve(courses, [], [
        { id: "req-health", kind: "specific_course", courseId: "health" },
      ]),
    ).toThrow(/health/);
  });

  it("does not object to credit rules, which name no course", () => {
    expect(() =>
      assertReferencesResolve(courses, [], [{ id: "req-total", kind: "total_credits" }]),
    ).not.toThrow();
  });
});
