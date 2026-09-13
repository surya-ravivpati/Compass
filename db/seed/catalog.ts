/**
 * The course catalog for Compass's one school.
 *
 * This data is part of the product, not filler. Every prerequisite here is one
 * a real high school would recognise, and the chains are the right length --
 * which means some of them genuinely do not fit in four years for a student
 * who arrives without Algebra 1. That is not a bug in the data. It is the
 * situation Compass exists to show people.
 *
 * Conventions (same as the test fixtures):
 *   - full-year course: `durationTerms: 2`, may only start in term 1
 *   - semester course:  `durationTerms: 1`, may start in either term
 *   - 1.0 credit per year-long course, 0.5 per semester course
 *   - a co-requisite that prior completion also satisfies is written
 *     `byOrWith(...)`, which expands to or(course X, concurrent X)
 *
 * Nothing in here is trusted blindly: `npm run db:validate` parses it, checks
 * every reference, detects cycles, and reports what a student could not reach.
 */

import type { Course, Pathway, PrereqExpr, RequirementRule } from "@/lib/solver/types";

const none: PrereqExpr = { kind: "none" };
const req = (courseId: string): PrereqExpr => ({ kind: "course", courseId });
const alongside = (courseId: string): PrereqExpr => ({ kind: "concurrent", courseId });
const all = (...children: PrereqExpr[]): PrereqExpr => ({ kind: "and", children });
const either = (...children: PrereqExpr[]): PrereqExpr => ({ kind: "or", children });
/** Taken beforehand, or at the same time. */
const byOrWith = (courseId: string): PrereqExpr => either(req(courseId), alongside(courseId));
/** Any one of several courses will do. */
const anyOf = (...courseIds: string[]): PrereqExpr => either(...courseIds.map(req));

const year = { durationTerms: 2 as const, termsOffered: [1] as const, credits: 1 };
const semester = { durationTerms: 1 as const, termsOffered: [1, 2] as const, credits: 0.5 };

export const SEED_COURSES: readonly Course[] = [
  /* ============================ Mathematics ============================ */
  { id: "algebra-1", code: "MTH110", title: "Algebra 1", subject: "math", level: "regular", prereq: none, ...year },
  { id: "geometry", code: "MTH120", title: "Geometry", subject: "math", level: "regular", prereq: req("algebra-1"), ...year },
  { id: "geometry-honors", code: "MTH125", title: "Honors Geometry", subject: "math", level: "honors", prereq: req("algebra-1"), ...year },
  { id: "algebra-2", code: "MTH210", title: "Algebra 2", subject: "math", level: "regular", prereq: anyOf("geometry", "geometry-honors"), ...year },
  { id: "algebra-2-honors", code: "MTH215", title: "Honors Algebra 2", subject: "math", level: "honors", prereq: req("geometry-honors"), ...year },
  { id: "precalculus", code: "MTH310", title: "Precalculus", subject: "math", level: "regular", prereq: anyOf("algebra-2", "algebra-2-honors"), ...year },
  { id: "precalculus-honors", code: "MTH315", title: "Honors Precalculus", subject: "math", level: "honors", prereq: req("algebra-2-honors"), ...year },
  { id: "statistics", code: "MTH320", title: "Statistics", subject: "math", level: "regular", prereq: anyOf("algebra-2", "algebra-2-honors"), ...semester },
  { id: "ap-statistics", code: "MTH430", title: "AP Statistics", subject: "math", level: "ap", prereq: anyOf("algebra-2", "algebra-2-honors"), ...year },
  { id: "ap-calculus-ab", code: "MTH410", title: "AP Calculus AB", subject: "math", level: "ap", prereq: anyOf("precalculus", "precalculus-honors"), ...year },
  // Reachable in four years only by way of the honors track, which is exactly
  // the tradeoff a student should be able to see before grade 9 is over.
  { id: "ap-calculus-bc", code: "MTH420", title: "AP Calculus BC", subject: "math", level: "ap", prereq: anyOf("ap-calculus-ab", "precalculus-honors"), ...year },

  /* ============================== Science ============================== */
  { id: "biology", code: "SCI110", title: "Biology", subject: "science", level: "regular", prereq: none, ...year },
  { id: "biology-honors", code: "SCI115", title: "Honors Biology", subject: "science", level: "honors", prereq: none, ...year },
  { id: "chemistry", code: "SCI210", title: "Chemistry", subject: "science", level: "regular", prereq: all(anyOf("biology", "biology-honors"), req("algebra-1")), ...year },
  { id: "chemistry-honors", code: "SCI215", title: "Honors Chemistry", subject: "science", level: "honors", prereq: all(req("biology-honors"), req("algebra-1")), ...year },
  { id: "physics", code: "SCI220", title: "Physics", subject: "science", level: "regular", prereq: all(anyOf("biology", "biology-honors"), req("algebra-1")), ...year },
  { id: "astronomy", code: "SCI230", title: "Astronomy", subject: "science", level: "regular", prereq: req("algebra-1"), ...semester },
  { id: "anatomy-and-physiology", code: "SCI320", title: "Anatomy and Physiology", subject: "science", level: "regular", prereq: all(anyOf("biology", "biology-honors"), anyOf("chemistry", "chemistry-honors")), ...year },
  { id: "ap-environmental-science", code: "SCI405", title: "AP Environmental Science", subject: "science", level: "ap", prereq: all(anyOf("biology", "biology-honors"), anyOf("chemistry", "chemistry-honors")), ...year },
  { id: "ap-biology", code: "SCI420", title: "AP Biology", subject: "science", level: "ap", prereq: all(anyOf("biology", "biology-honors"), anyOf("chemistry", "chemistry-honors")), ...year },
  { id: "ap-chemistry", code: "SCI410", title: "AP Chemistry", subject: "science", level: "ap", prereq: all(anyOf("chemistry", "chemistry-honors"), anyOf("algebra-2", "algebra-2-honors")), ...year },
  { id: "ap-physics-1", code: "SCI430", title: "AP Physics 1", subject: "science", level: "ap", prereq: all(req("physics"), anyOf("algebra-2", "algebra-2-honors")), ...year },
  // Calculus may be taken first or alongside -- the classic co-requisite.
  { id: "ap-physics-c", code: "SCI440", title: "AP Physics C", subject: "science", level: "ap", prereq: all(req("ap-physics-1"), byOrWith("ap-calculus-ab")), ...year },

  /* ============================== English ============================== */
  { id: "english-9", code: "ENG110", title: "English 9", subject: "english", level: "regular", prereq: none, ...year },
  { id: "english-9-honors", code: "ENG115", title: "Honors English 9", subject: "english", level: "honors", prereq: none, ...year },
  { id: "english-10", code: "ENG210", title: "English 10", subject: "english", level: "regular", prereq: anyOf("english-9", "english-9-honors"), ...year },
  { id: "english-10-honors", code: "ENG215", title: "Honors English 10", subject: "english", level: "honors", prereq: req("english-9-honors"), ...year },
  { id: "english-11", code: "ENG310", title: "English 11", subject: "english", level: "regular", prereq: anyOf("english-10", "english-10-honors"), ...year },
  { id: "ap-english-language", code: "ENG405", title: "AP English Language", subject: "english", level: "ap", prereq: anyOf("english-10", "english-10-honors"), ...year },
  { id: "english-12", code: "ENG320", title: "English 12", subject: "english", level: "regular", prereq: anyOf("english-11", "ap-english-language"), ...year },
  { id: "ap-english-literature", code: "ENG410", title: "AP English Literature", subject: "english", level: "ap", prereq: anyOf("english-11", "ap-english-language"), ...year },
  { id: "creative-writing", code: "ENG240", title: "Creative Writing", subject: "english", level: "regular", prereq: anyOf("english-9", "english-9-honors"), ...semester },
  { id: "journalism", code: "ENG250", title: "Journalism", subject: "english", level: "regular", prereq: anyOf("english-9", "english-9-honors"), ...semester },

  /* =========================== Social Studies ========================== */
  { id: "world-history", code: "SOC110", title: "World History", subject: "social_studies", level: "regular", prereq: none, ...year },
  { id: "ap-world-history", code: "SOC115", title: "AP World History", subject: "social_studies", level: "ap", prereq: none, ...year },
  { id: "us-history", code: "SOC210", title: "US History", subject: "social_studies", level: "regular", prereq: anyOf("world-history", "ap-world-history"), ...year },
  { id: "ap-us-history", code: "SOC215", title: "AP US History", subject: "social_studies", level: "ap", prereq: anyOf("world-history", "ap-world-history"), ...year },
  { id: "ap-us-government", code: "SOC410", title: "AP US Government", subject: "social_studies", level: "ap", prereq: anyOf("us-history", "ap-us-history"), ...year },
  { id: "economics", code: "SOC320", title: "Economics", subject: "social_studies", level: "regular", prereq: req("algebra-1"), ...semester },
  { id: "ap-macroeconomics", code: "SOC420", title: "AP Macroeconomics", subject: "social_studies", level: "ap", prereq: all(anyOf("algebra-2", "algebra-2-honors"), anyOf("us-history", "ap-us-history")), ...year },
  { id: "psychology", code: "SOC330", title: "Psychology", subject: "social_studies", level: "regular", prereq: none, ...semester },
  { id: "ap-psychology", code: "SOC430", title: "AP Psychology", subject: "social_studies", level: "ap", prereq: anyOf("psychology", "biology", "biology-honors"), ...year },

  /* =========================== World Language ========================== */
  { id: "spanish-1", code: "WLG110", title: "Spanish 1", subject: "world_language", level: "regular", prereq: none, ...year },
  { id: "spanish-2", code: "WLG210", title: "Spanish 2", subject: "world_language", level: "regular", prereq: req("spanish-1"), ...year },
  { id: "spanish-3", code: "WLG310", title: "Spanish 3", subject: "world_language", level: "regular", prereq: req("spanish-2"), ...year },
  { id: "ap-spanish-language", code: "WLG410", title: "AP Spanish Language", subject: "world_language", level: "ap", prereq: req("spanish-3"), ...year },
  { id: "ap-spanish-literature", code: "WLG420", title: "AP Spanish Literature", subject: "world_language", level: "ap", prereq: anyOf("spanish-3", "ap-spanish-language"), ...year },
  { id: "french-1", code: "WLG120", title: "French 1", subject: "world_language", level: "regular", prereq: none, ...year },
  { id: "french-2", code: "WLG220", title: "French 2", subject: "world_language", level: "regular", prereq: req("french-1"), ...year },
  { id: "french-3", code: "WLG320", title: "French 3", subject: "world_language", level: "regular", prereq: req("french-2"), ...year },
  { id: "ap-french-language", code: "WLG430", title: "AP French Language", subject: "world_language", level: "ap", prereq: req("french-3"), ...year },
  { id: "latin-1", code: "WLG130", title: "Latin 1", subject: "world_language", level: "regular", prereq: none, ...year },
  { id: "latin-2", code: "WLG230", title: "Latin 2", subject: "world_language", level: "regular", prereq: req("latin-1"), ...year },
  { id: "latin-3", code: "WLG330", title: "Latin 3", subject: "world_language", level: "regular", prereq: req("latin-2"), ...year },

  /* ========================== Computer Science ========================= */
  { id: "intro-to-cs", code: "CSC110", title: "Introduction to Computer Science", subject: "computer_science", level: "regular", prereq: none, ...semester },
  { id: "web-development", code: "CSC130", title: "Web Development", subject: "computer_science", level: "regular", prereq: req("intro-to-cs"), ...semester },
  { id: "cybersecurity-fundamentals", code: "CSC140", title: "Cybersecurity Fundamentals", subject: "computer_science", level: "regular", prereq: req("intro-to-cs"), ...semester },
  { id: "ap-cs-principles", code: "CSC210", title: "AP Computer Science Principles", subject: "computer_science", level: "ap", prereq: req("intro-to-cs"), ...year },
  { id: "ap-cs-a", code: "CSC410", title: "AP Computer Science A", subject: "computer_science", level: "ap", prereq: all(req("ap-cs-principles"), anyOf("algebra-2", "algebra-2-honors")), ...year },
  { id: "data-structures", code: "CSC420", title: "Data Structures", subject: "computer_science", level: "honors", prereq: req("ap-cs-a"), ...semester },

  /* =============================== Arts =============================== */
  { id: "art-1", code: "ART110", title: "Studio Art 1", subject: "arts", level: "regular", prereq: none, ...semester },
  { id: "art-2", code: "ART210", title: "Studio Art 2", subject: "arts", level: "regular", prereq: req("art-1"), ...semester },
  { id: "digital-photography", code: "ART230", title: "Digital Photography", subject: "arts", level: "regular", prereq: req("art-1"), ...semester },
  { id: "ap-studio-art", code: "ART410", title: "AP Studio Art", subject: "arts", level: "ap", prereq: req("art-2"), ...year },
  { id: "concert-band", code: "ART120", title: "Concert Band", subject: "arts", level: "regular", prereq: none, ...year },
  { id: "wind-ensemble", code: "ART220", title: "Wind Ensemble", subject: "arts", level: "honors", prereq: req("concert-band"), ...year },
  { id: "chorus", code: "ART130", title: "Chorus", subject: "arts", level: "regular", prereq: none, ...year },
  { id: "theater-1", code: "ART140", title: "Theater 1", subject: "arts", level: "regular", prereq: none, ...semester },
  { id: "theater-2", code: "ART240", title: "Theater 2", subject: "arts", level: "regular", prereq: req("theater-1"), ...semester },

  /* =========================== PE and Health ========================== */
  { id: "health", code: "PEH110", title: "Health", subject: "pe_health", level: "regular", prereq: none, ...semester },
  { id: "physical-education-9", code: "PEH120", title: "Physical Education 9", subject: "pe_health", level: "regular", prereq: none, ...semester },
  { id: "physical-education-10", code: "PEH220", title: "Physical Education 10", subject: "pe_health", level: "regular", prereq: req("physical-education-9"), ...semester },
  { id: "weight-training", code: "PEH230", title: "Weight Training", subject: "pe_health", level: "regular", prereq: none, ...semester },

  /* ============================= Electives ============================ */
  { id: "engineering-design", code: "ELC210", title: "Engineering Design", subject: "elective", level: "regular", prereq: req("intro-to-cs"), ...semester },
  { id: "robotics-engineering", code: "ELC310", title: "Robotics Engineering", subject: "elective", level: "honors", prereq: all(req("engineering-design"), req("algebra-1")), ...year },
  { id: "personal-finance", code: "ELC120", title: "Personal Finance", subject: "elective", level: "regular", prereq: req("algebra-1"), ...semester },
  { id: "speech-and-debate", code: "ELC130", title: "Speech and Debate", subject: "elective", level: "regular", prereq: anyOf("english-9", "english-9-honors"), ...semester },
  { id: "yearbook", code: "ELC140", title: "Yearbook", subject: "elective", level: "regular", prereq: anyOf("english-9", "english-9-honors"), ...year },
];

/**
 * Goal pathways. A goal is a set of culminating courses, so a deadline is the
 * tightest one across all of them.
 */
export const SEED_PATHWAYS: readonly (Pathway & { sortOrder: number })[] = [
  {
    id: "engineering",
    name: "Engineering",
    description: "Calculus and calculus-based physics, with hands-on design work.",
    goalCourseIds: ["ap-physics-c", "ap-calculus-ab", "robotics-engineering"],
    sortOrder: 1,
  },
  {
    id: "computer-science",
    name: "Computer Science",
    description: "The full CS sequence through AP Computer Science A, backed by calculus.",
    goalCourseIds: ["ap-cs-a", "ap-calculus-ab"],
    sortOrder: 2,
  },
  {
    id: "biomedical-engineering",
    name: "Biomedical Engineering",
    description: "Life sciences and chemistry at the AP level, alongside calculus.",
    goalCourseIds: ["ap-biology", "ap-chemistry", "ap-calculus-ab"],
    sortOrder: 3,
  },
  {
    id: "nursing",
    name: "Nursing",
    description: "Biology, chemistry, and anatomy, with statistics for clinical work.",
    goalCourseIds: ["ap-biology", "anatomy-and-physiology", "ap-statistics"],
    sortOrder: 4,
  },
  {
    // No goal courses on purpose. Nothing should impose a deadline on a
    // student who has not chosen yet, and the solver must not invent one.
    id: "undecided",
    name: "Undecided - keep options open",
    description: "No committed pathway. Nothing is ruled out yet.",
    goalCourseIds: [],
    sortOrder: 5,
  },
];

/** Graduation requirements for this school. */
export const SEED_REQUIREMENTS: readonly (RequirementRule & { sortOrder: number })[] = [
  { kind: "credits_in_subject", id: "req-english", label: "English", subject: "english", credits: 4, sortOrder: 1 },
  { kind: "credits_in_subject", id: "req-math", label: "Mathematics", subject: "math", credits: 3, sortOrder: 2 },
  { kind: "credits_in_subject", id: "req-science", label: "Science", subject: "science", credits: 3, sortOrder: 3 },
  { kind: "credits_in_subject", id: "req-social", label: "Social Studies", subject: "social_studies", credits: 3, sortOrder: 4 },
  { kind: "credits_in_subject", id: "req-language", label: "World Language", subject: "world_language", credits: 2, sortOrder: 5 },
  { kind: "credits_in_subject", id: "req-arts", label: "Arts", subject: "arts", credits: 1, sortOrder: 6 },
  { kind: "credits_in_subject", id: "req-pe-health", label: "PE and Health", subject: "pe_health", credits: 1.5, sortOrder: 7 },
  { kind: "specific_course", id: "req-health-course", label: "Health", courseId: "health", sortOrder: 8 },
  { kind: "total_credits", id: "req-total", label: "Total credits", credits: 24, sortOrder: 9 },
];
