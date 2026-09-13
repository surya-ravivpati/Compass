import type { Grade } from "@/lib/solver/types";

/**
 * Which grade is a student in right now?
 *
 * The solver refuses to read a clock, so this is the boundary that does it --
 * and it takes `now` as an argument rather than calling `new Date()` inside,
 * so it can be tested without the answer changing every September.
 *
 * A US school year is named for the year it ends in: the year beginning
 * August 2026 is "2026-27", and a student in it graduates in 2027 if they are
 * a senior. Months from August onward therefore belong to the next school year.
 */
export function currentGradeFor(gradYear: number, now: Date): Grade {
  const schoolYearEnd = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  const yearsRemaining = gradYear - schoolYearEnd;
  const grade = 12 - yearsRemaining;

  // Clamped rather than rejected. A student who has already graduated, or who
  // set an implausible year, should still see a usable four-year board instead
  // of an error page.
  if (grade < 9) return 9;
  if (grade > 12) return 12;
  return grade as Grade;
}
