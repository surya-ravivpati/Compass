import { describe, expect, it } from "vitest";
import { currentGradeFor } from "@/lib/plan/current-grade";

/**
 * The solver refuses to read a clock, so this is the boundary that does. It
 * takes `now` as an argument precisely so these tests do not change their
 * answer every September.
 */
describe("currentGradeFor", () => {
  const sept = (year: number) => new Date(`${year}-09-15T12:00:00Z`);
  const may = (year: number) => new Date(`${year}-05-15T12:00:00Z`);

  it("puts a student four years out in grade 9", () => {
    expect(currentGradeFor(2030, sept(2026))).toBe(9);
  });

  it("advances a grade each autumn", () => {
    expect(currentGradeFor(2030, sept(2027))).toBe(10);
    expect(currentGradeFor(2030, sept(2028))).toBe(11);
    expect(currentGradeFor(2030, sept(2029))).toBe(12);
  });

  it("keeps the same grade across the new calendar year", () => {
    // September 2026 and May 2027 are the same school year, so the same grade.
    expect(currentGradeFor(2030, sept(2026))).toBe(9);
    expect(currentGradeFor(2030, may(2027))).toBe(9);
  });

  it("treats August as the start of the new school year", () => {
    expect(currentGradeFor(2030, new Date("2027-07-31T12:00:00Z"))).toBe(9);
    expect(currentGradeFor(2030, new Date("2027-08-01T12:00:00Z"))).toBe(10);
  });

  it("clamps rather than failing on an implausible year", () => {
    // Already graduated, or typed something odd during setup. Either way the
    // student should get a usable board, not an error page.
    expect(currentGradeFor(2020, sept(2026))).toBe(12);
    expect(currentGradeFor(2099, sept(2026))).toBe(9);
  });
});
