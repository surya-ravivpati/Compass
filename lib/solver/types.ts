/**
 * Core data model for the Compass solver.
 *
 * Everything in /lib/solver is pure TypeScript: plain data in, plain data out,
 * no I/O, no clock, no randomness. That purity is enforced by lint (see
 * eslint.config.mjs) and is what makes the solver deterministic and testable
 * in isolation from React, Next, and the database.
 *
 * Note in particular that the solver never reads the current date. "What grade
 * is the student in right now" is an input (`Plan.currentGrade`), not something
 * the solver derives from a clock -- otherwise the same plan would solve
 * differently depending on when the test ran.
 */

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/**
 * High school runs grade 9 through grade 12, two terms per year.
 *
 * Internally the solver collapses (grade, term) onto a single dense integer
 * axis -- the *term index* -- because every interesting question here is
 * interval arithmetic: does this course finish before that one starts, does
 * this chain still fit before graduation. Comparing integers is far easier to
 * reason about (and to test) than comparing (grade, term) pairs everywhere.
 *
 *   Grade  9 T1 = 0     Grade 11 T1 = 4
 *   Grade  9 T2 = 1     Grade 11 T2 = 5
 *   Grade 10 T1 = 2     Grade 12 T1 = 6
 *   Grade 10 T2 = 3     Grade 12 T2 = 7
 *
 * Calendar years (a `gradYear` like 2030) convert at the boundary and never
 * appear in the solver's interval math.
 */
export type Grade = 9 | 10 | 11 | 12;
export type Term = 1 | 2;

/** A point on the dense 0..7 planning axis. */
export type TermIndex = number;

export const GRADES: readonly Grade[] = [9, 10, 11, 12];
export const TERMS: readonly Term[] = [1, 2];
export const TERMS_PER_YEAR = 2;

export const FIRST_TERM_INDEX: TermIndex = 0;
export const LAST_TERM_INDEX: TermIndex = GRADES.length * TERMS_PER_YEAR - 1; // 7

/** (grade, term) -> term index. */
export function termIndex(grade: Grade, term: Term): TermIndex {
  return (grade - 9) * TERMS_PER_YEAR + (term - 1);
}

/** term index -> grade. */
export function gradeOfIndex(index: TermIndex): Grade {
  return (9 + Math.floor(index / TERMS_PER_YEAR)) as Grade;
}

/** term index -> term. */
export function termOfIndex(index: TermIndex): Term {
  return ((index % TERMS_PER_YEAR) + 1) as Term;
}

/** Calendar year in which `grade` is completed, given the graduation year. */
export function calendarYearOfGrade(grade: Grade, gradYear: number): number {
  return gradYear - (12 - grade);
}

/* ------------------------------------------------------------------ *
 * Prerequisites
 * ------------------------------------------------------------------ */

/**
 * Prerequisites are expressions, not flat lists -- real catalogs say things
 * like "Algebra 2 AND (Chemistry OR Physics)", and flattening that to a list
 * would either over-constrain the student or silently let them past a
 * requirement they never met.
 */
export type PrereqExpr =
  | { kind: "course"; courseId: CourseId }
  | { kind: "and"; children: readonly PrereqExpr[] }
  | { kind: "or"; children: readonly PrereqExpr[] }
  | { kind: "concurrent"; courseId: CourseId }
  | { kind: "none" };

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

export type CourseId = string;

export type Subject =
  | "math"
  | "science"
  | "english"
  | "social_studies"
  | "world_language"
  | "computer_science"
  | "arts"
  | "pe_health"
  | "elective";

export type CourseLevel = "regular" | "honors" | "ap";

/**
 * 1 = one term (a semester course), 2 = both terms (a full-year course).
 *
 * This field is what makes term-granular prerequisites honest. Without it, a
 * student could take Algebra 2 in the fall and Precalculus in the spring of
 * the same year and the solver would call that legal -- compressing a
 * four-year math chain into two. It is required on every course rather than
 * defaulted, because a silently-defaulted duration corrupts every downstream
 * deadline in a way nobody would notice.
 */
export type DurationTerms = 1 | 2;

export interface Course {
  readonly id: CourseId;
  readonly code: string;
  readonly title: string;
  readonly credits: number;
  readonly subject: Subject;
  readonly level: CourseLevel;
  /**
   * Terms in which this course may *start*. A full-year course may only start
   * in term 1 -- starting it in term 2 would run past the end of the year.
   * `buildCatalog` rejects catalogs that violate this.
   */
  readonly termsOffered: readonly Term[];
  readonly durationTerms: DurationTerms;
  readonly prereq: PrereqExpr;
}

/**
 * An indexed, validated catalog. Built once via `buildCatalog` (graph.ts) so
 * the solver can look courses up in O(1) instead of scanning arrays.
 */
export interface Catalog {
  readonly all: readonly Course[];
  readonly byId: ReadonlyMap<CourseId, Course>;
}

/* ------------------------------------------------------------------ *
 * Plans
 * ------------------------------------------------------------------ */

/** A course the student has placed in a specific slot on the planning grid. */
export interface Placement {
  readonly courseId: CourseId;
  readonly grade: Grade;
  readonly term: Term;
}

/** A course the student finished before planning started. */
export interface CompletedCourse {
  readonly courseId: CourseId;
  /**
   * The grade in which it was completed. Deliberately a plain number rather
   * than `Grade`: students routinely finish Algebra 1 in 8th grade, and a
   * model that cannot express that would force the most common real starting
   * point to be recorded as a lie. Only used for display and credit counting
   * -- completed courses satisfy prerequisites unconditionally, whenever they
   * happened.
   */
  readonly grade: number;
}

export interface Plan {
  /** Calendar year of graduation, e.g. 2030. Used only for display mapping. */
  readonly gradYear: number;
  /**
   * The grade the student is in now. Terms before this grade are in the past
   * and cannot receive new placements. Supplied by the caller rather than
   * derived from a clock, so the solver stays deterministic.
   */
  readonly currentGrade: Grade;
  readonly completed: readonly CompletedCourse[];
  readonly placements: readonly Placement[];
}

/** The window of the planning grid still open for new placements. */
export interface PlanHorizon {
  readonly firstOpenTermIndex: TermIndex;
  readonly lastTermIndex: TermIndex;
}

export function horizonOf(plan: Plan): PlanHorizon {
  return {
    firstOpenTermIndex: termIndex(plan.currentGrade, 1),
    lastTermIndex: LAST_TERM_INDEX,
  };
}

/* ------------------------------------------------------------------ *
 * Pathways (goals)
 * ------------------------------------------------------------------ */

/**
 * A goal is a set of culminating courses, not a single one. "Biomedical
 * Engineering" means reaching AP Biology *and* AP Chemistry *and* Calculus --
 * so deadlines are the tightest across all of them.
 */
export interface Pathway {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly goalCourseIds: readonly CourseId[];
}

/* ------------------------------------------------------------------ *
 * Graduation requirements
 * ------------------------------------------------------------------ */

export type RequirementRule =
  | {
      readonly kind: "credits_in_subject";
      readonly id: string;
      readonly label: string;
      readonly subject: Subject;
      readonly credits: number;
    }
  | {
      readonly kind: "specific_course";
      readonly id: string;
      readonly label: string;
      readonly courseId: CourseId;
    }
  | {
      readonly kind: "total_credits";
      readonly id: string;
      readonly label: string;
      readonly credits: number;
    };

export type RequirementStatus = "met" | "on_track" | "at_risk";

export interface RequirementResult {
  readonly rule: RequirementRule;
  /** Credits already banked from completed courses. */
  readonly earned: number;
  /**
   * Additional credits the current plan would add. Not named in the spec's
   * return shape, but the progress bar needs to distinguish "3 done" from
   * "3 done + 1 planned" -- without it the UI cannot render honestly.
   */
  readonly planned: number;
  readonly required: number;
  readonly status: RequirementStatus;
}

/* ------------------------------------------------------------------ *
 * Solver findings
 * ------------------------------------------------------------------ */

/**
 * A course that can no longer fit anywhere in the remaining plan.
 *
 * `reason` is rendered directly to a high school student, so it is written in
 * plain English and names the actual courses involved. "Dependency constraint
 * violated" is a bug, not a reason.
 */
export interface UnreachableCourse {
  readonly courseId: CourseId;
  readonly reason: string;
}

/**
 * A course the student *has* placed whose prerequisites are not satisfied at
 * that slot. Distinct from unreachable: this one is fixable by moving things
 * around, and the student did it to themselves just now.
 */
export interface PrereqViolation {
  readonly courseId: CourseId;
  readonly grade: Grade;
  readonly term: Term;
  /**
   * `prerequisite` -- the course is where the student put it, but what it
   * needs is not finished in time.
   * `not_offered` -- the slot itself is impossible; the school does not run
   * this course that term.
   */
  readonly kind: "prerequisite" | "not_offered";
  readonly reason: string;
}

/* ------------------------------------------------------------------ *
 * Activities
 * ------------------------------------------------------------------ */

export type Season = "fall" | "winter" | "spring" | "year_round";

/** The three seasons an activity can actually occupy. */
export const ACTIVE_SEASONS = ["fall", "winter", "spring"] as const;
export type ActiveSeason = (typeof ACTIVE_SEASONS)[number];

/** 0 = Sunday .. 6 = Saturday, matching Date#getDay. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Meeting times are minutes from midnight, not strings -- the solver compares
 * them constantly and integer comparison has no timezone or parsing surprises.
 * The interval is half-open: a club ending at 16:00 does not conflict with one
 * starting at 16:00.
 */
export interface ClubMeeting {
  readonly dayOfWeek: DayOfWeek;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface Club {
  readonly id: string;
  readonly name: string;
  readonly season: Season;
  readonly weeklyHours: number;
  readonly description: string;
  readonly meetings: readonly ClubMeeting[];
}

/** A club the student intends to do, across a span of grades. */
export interface ActivitySelection {
  readonly clubId: string;
  readonly startGrade: Grade;
  readonly endGrade: Grade;
}

/** Default weekly-hour cap. Configurable per student in settings. */
export const DEFAULT_WEEKLY_HOUR_CAP = 15;

/** "15:30" -> 930. Convenience for turning catalog data into solver input. */
export function minutesFromHHMM(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    throw new Error(`Invalid time "${hhmm}": expected HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time "${hhmm}": out of range.`);
  }
  return hours * 60 + minutes;
}
