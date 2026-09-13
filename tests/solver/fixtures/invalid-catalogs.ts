/**
 * Catalogs that are wrong on purpose.
 *
 * A cycle in a catalog is a data bug, and the solver's job is to refuse it
 * loudly. These fixtures pin down exactly which shapes are refused -- notably
 * that mutual co-requisites are legal while anything containing a strict edge
 * in the loop is not.
 */

import type { Course, PrereqExpr } from "@/lib/solver/types";

const req = (courseId: string): PrereqExpr => ({ kind: "course", courseId });
const alongside = (courseId: string): PrereqExpr => ({ kind: "concurrent", courseId });
const none: PrereqExpr = { kind: "none" };

const year = { durationTerms: 2 as const, termsOffered: [1] as const, credits: 1 };

const base = {
  code: "TST100",
  subject: "elective" as const,
  level: "regular" as const,
  ...year,
};

/** A requires B, B requires A. Impossible. */
export const STRICT_CYCLE: readonly Course[] = [
  { ...base, id: "alpha", title: "Alpha", prereq: req("beta") },
  { ...base, id: "beta", title: "Beta", prereq: req("alpha") },
];

/** A three-step loop, to prove the reported path is not just a pair. */
export const LONG_STRICT_CYCLE: readonly Course[] = [
  { ...base, id: "alpha", title: "Alpha", prereq: req("beta") },
  { ...base, id: "beta", title: "Beta", prereq: req("gamma") },
  { ...base, id: "gamma", title: "Gamma", prereq: req("alpha") },
];

/**
 * A must be taken alongside B and B alongside A. Legal -- these are simply
 * two courses you sign up for together, like a lab and its lecture.
 */
export const MUTUAL_COREQUISITES: readonly Course[] = [
  { ...base, id: "lecture", title: "Physics Lecture", prereq: alongside("lab") },
  { ...base, id: "lab", title: "Physics Lab", prereq: alongside("lecture") },
];

/**
 * A must finish before B, but B must run alongside A. Impossible, and the
 * case a naive "ignore concurrent edges" cycle check would wave through.
 */
export const MIXED_CYCLE: readonly Course[] = [
  { ...base, id: "first", title: "First", prereq: alongside("second") },
  { ...base, id: "second", title: "Second", prereq: req("first") },
];

/** References a course that does not exist. */
export const DANGLING_PREREQ: readonly Course[] = [
  { ...base, id: "orphan", title: "Orphan", prereq: req("does-not-exist") },
];

/** A full-year course claiming it can start in the spring. */
export const FULL_YEAR_STARTING_IN_TERM_2: readonly Course[] = [
  {
    ...base,
    id: "impossible-timing",
    title: "Impossible Timing",
    prereq: none,
    durationTerms: 2,
    termsOffered: [2],
  },
];
