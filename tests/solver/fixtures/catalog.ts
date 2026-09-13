/**
 * Fixture catalog used by the solver tests.
 *
 * This is a realistic miniature of one school's offerings -- roughly thirty
 * courses with the prerequisite chains a real high school actually has. The
 * relationships are not arbitrary: the tests lean on the fact that these
 * chains are long enough to genuinely run out of room inside four years,
 * which is the entire situation Compass exists to surface.
 *
 * Conventions:
 *   - A full-year course is `durationTerms: 2` and can only start in term 1.
 *   - A semester course is `durationTerms: 1` and may start in either term.
 *   - 1.0 credit per year-long course, 0.5 per semester course.
 *   - A co-requisite that prior completion also satisfies is written
 *     `or(course X, concurrent X)`, per the convention in expression.ts.
 */

import type { Course, PrereqExpr } from "@/lib/solver/types";

/* -- small builders, so the catalog below reads like course descriptions -- */

const none: PrereqExpr = { kind: "none" };
const req = (courseId: string): PrereqExpr => ({ kind: "course", courseId });
const alongside = (courseId: string): PrereqExpr => ({
  kind: "concurrent",
  courseId,
});
const all = (...children: PrereqExpr[]): PrereqExpr => ({
  kind: "and",
  children,
});
const either = (...children: PrereqExpr[]): PrereqExpr => ({
  kind: "or",
  children,
});
/** Taken beforehand, or at the same time. */
const byOrWith = (courseId: string): PrereqExpr =>
  either(req(courseId), alongside(courseId));

const year = {
  durationTerms: 2 as const,
  termsOffered: [1] as const,
  credits: 1,
};
const semester = {
  durationTerms: 1 as const,
  termsOffered: [1, 2] as const,
  credits: 0.5,
};

export const FIXTURE_COURSES: readonly Course[] = [
  /* ---------------------------- Mathematics --------------------------- */
  // Commonly finished in 8th grade, which is why several chains below only
  // fit inside four years for a student who arrives having already done it.
  { id: "algebra-1", code: "MTH110", title: "Algebra 1", subject: "math", level: "regular", prereq: none, ...year },
  { id: "geometry", code: "MTH120", title: "Geometry", subject: "math", level: "regular", prereq: req("algebra-1"), ...year },
  { id: "algebra-2", code: "MTH210", title: "Algebra 2", subject: "math", level: "regular", prereq: req("geometry"), ...year },
  { id: "precalculus", code: "MTH310", title: "Precalculus", subject: "math", level: "honors", prereq: req("algebra-2"), ...year },
  { id: "ap-calculus-ab", code: "MTH410", title: "AP Calculus AB", subject: "math", level: "ap", prereq: req("precalculus"), ...year },
  { id: "ap-calculus-bc", code: "MTH420", title: "AP Calculus BC", subject: "math", level: "ap", prereq: req("ap-calculus-ab"), ...year },
  { id: "ap-statistics", code: "MTH430", title: "AP Statistics", subject: "math", level: "ap", prereq: req("algebra-2"), ...year },

  /* ------------------------------ Science ----------------------------- */
  { id: "biology", code: "SCI110", title: "Biology", subject: "science", level: "regular", prereq: none, ...year },
  { id: "chemistry", code: "SCI210", title: "Chemistry", subject: "science", level: "regular", prereq: all(req("biology"), req("algebra-1")), ...year },
  { id: "physics", code: "SCI220", title: "Physics", subject: "science", level: "regular", prereq: all(req("biology"), req("algebra-1")), ...year },
  { id: "ap-chemistry", code: "SCI410", title: "AP Chemistry", subject: "science", level: "ap", prereq: all(req("chemistry"), req("algebra-2")), ...year },
  // A genuine OR: either flavour of chemistry opens AP Biology.
  { id: "ap-biology", code: "SCI420", title: "AP Biology", subject: "science", level: "ap", prereq: all(req("biology"), either(req("chemistry"), req("ap-chemistry"))), ...year },
  { id: "ap-physics-1", code: "SCI430", title: "AP Physics 1", subject: "science", level: "ap", prereq: all(req("physics"), req("algebra-2")), ...year },
  // Calculus may be taken first or alongside -- the classic co-requisite.
  { id: "ap-physics-c", code: "SCI440", title: "AP Physics C", subject: "science", level: "ap", prereq: all(req("ap-physics-1"), byOrWith("ap-calculus-ab")), ...year },

  /* ------------------------------ English ----------------------------- */
  { id: "english-9", code: "ENG110", title: "English 9", subject: "english", level: "regular", prereq: none, ...year },
  { id: "english-10", code: "ENG210", title: "English 10", subject: "english", level: "regular", prereq: req("english-9"), ...year },
  { id: "english-11", code: "ENG310", title: "English 11", subject: "english", level: "regular", prereq: req("english-10"), ...year },
  { id: "ap-english-literature", code: "ENG410", title: "AP English Literature", subject: "english", level: "ap", prereq: req("english-11"), ...year },

  /* -------------------------- Social Studies -------------------------- */
  { id: "world-history", code: "SOC110", title: "World History", subject: "social_studies", level: "regular", prereq: none, ...year },
  { id: "us-history", code: "SOC210", title: "US History", subject: "social_studies", level: "regular", prereq: req("world-history"), ...year },
  { id: "ap-us-government", code: "SOC410", title: "AP US Government", subject: "social_studies", level: "ap", prereq: req("us-history"), ...year },
  { id: "economics", code: "SOC320", title: "Economics", subject: "social_studies", level: "regular", prereq: req("algebra-1"), ...semester },

  /* --------------------------- Computer Science ----------------------- */
  { id: "intro-to-cs", code: "CSC110", title: "Introduction to Computer Science", subject: "computer_science", level: "regular", prereq: none, ...semester },
  { id: "ap-cs-principles", code: "CSC210", title: "AP Computer Science Principles", subject: "computer_science", level: "ap", prereq: req("intro-to-cs"), ...year },
  { id: "ap-cs-a", code: "CSC410", title: "AP Computer Science A", subject: "computer_science", level: "ap", prereq: all(req("ap-cs-principles"), req("algebra-2")), ...year },

  /* --------------------------- World Language ------------------------- */
  { id: "spanish-1", code: "WLG110", title: "Spanish 1", subject: "world_language", level: "regular", prereq: none, ...year },
  { id: "spanish-2", code: "WLG210", title: "Spanish 2", subject: "world_language", level: "regular", prereq: req("spanish-1"), ...year },
  { id: "spanish-3", code: "WLG310", title: "Spanish 3", subject: "world_language", level: "regular", prereq: req("spanish-2"), ...year },
  { id: "ap-spanish", code: "WLG410", title: "AP Spanish Language", subject: "world_language", level: "ap", prereq: req("spanish-3"), ...year },

  /* ----------------------------- Electives ---------------------------- */
  // Semester courses are what make term granularity earn its keep: two of
  // these fit inside one year, and a chain through them moves at twice the
  // speed of a chain through year-long courses.
  { id: "health", code: "PEH110", title: "Health", subject: "pe_health", level: "regular", prereq: none, ...semester },
  { id: "physical-education", code: "PEH120", title: "Physical Education", subject: "pe_health", level: "regular", prereq: none, ...semester },
  { id: "engineering-design", code: "ELC210", title: "Engineering Design", subject: "elective", level: "regular", prereq: req("intro-to-cs"), ...semester },
];
