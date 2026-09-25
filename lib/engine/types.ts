/**
 * Plain data types for the Compass academic engine.
 *
 * Everything here is serialisable: the same values cross the server/client
 * boundary, go into the database, and are handed to the AI layer as facts.
 */

/**
 * Time inside the engine is a term index. 0 is freshman fall, 1 freshman
 * spring, ... 7 senior spring. Grades, seasons and calendar years are derived
 * at the boundary and never stored inside a placement.
 */
export type TermIndex = number

/** Completed before high school (middle school, summer programs). */
export const BEFORE_HIGH_SCHOOL: TermIndex = -1

export const TERMS_PER_YEAR = 2
export const YEARS = 4
export const TERM_COUNT = TERMS_PER_YEAR * YEARS

export type GradeLevel = 9 | 10 | 11 | 12
export type Season = 'fall' | 'spring'

/** Rigor tier. `post-ap` is beyond AP (college-level coursework). */
export type Level = 'standard' | 'honors' | 'ap' | 'post-ap'

/** Typical workload, 1 (light) to 4 (intense). A catalog estimate, not a rule. */
export type Workload = 1 | 2 | 3 | 4

/**
 * Where a fact came from. The UI and the AI layer cite this so a student can
 * tell a catalog rule from a school configuration choice.
 */
export interface SourceRef {
  kind: 'catalog' | 'school-config' | 'seed'
  /** e.g. "coursed.pdf" or "Compass demo catalog". */
  document: string
  page?: number
  /** Verbatim catalog wording, when the fact was extracted from a document. */
  quote?: string
}

/**
 * One way to satisfy a prerequisite group.
 *
 * - `before`: the course must be finished before this one starts.
 * - `before-or-concurrent`: finished before, or taken at the same time.
 * - `concurrent`: taken at the same time (a co-requisite). Prior completion
 *   does not count; author `before-or-concurrent` when it should.
 */
export interface PrereqOption {
  courseId: string
  timing: 'before' | 'before-or-concurrent' | 'concurrent'
}

/**
 * Prerequisites are conjunctive normal form: every group must be satisfied,
 * and a group is satisfied by any one of its options.
 */
export interface PrereqGroup {
  anyOf: PrereqOption[]
  /** Catalog wording the engine cannot enforce, e.g. "with a B or better". */
  note?: string
}

export interface Course {
  id: string
  code?: string
  name: string
  department: string
  description: string
  /** Credits earned on completion. */
  credits: number
  /** 1 = one semester, 2 = full year. Required: a wrong default corrupts every deadline. */
  durationTerms: 1 | 2
  /** Grade levels allowed to take the course. */
  grades: GradeLevel[]
  /** Seasons the course may start in. Full-year courses start in fall. */
  seasons: Season[]
  prerequisites: PrereqGroup[]
  level: Level
  workload: Workload
  /** True when the catalog gave no workload and it was estimated from the level. */
  workloadEstimated?: boolean
  /** Lab-based course (weekly lab time and write-ups). */
  lab?: boolean
  /** Interest and subject tags, e.g. "engineering", "biology". */
  tags: string[]
  /** Requirement ids this course can count toward. */
  satisfies: string[]
  /** Ordered sequence membership, e.g. { id: "spanish", step: 2 }. */
  sequence?: { id: string; step: number }
  /**
   * Courses in the same group cover the same content at different levels
   * (Algebra 2 and Honors Algebra 2). Taking two of them is a repeat.
   */
  equivalenceGroup?: string
  /** How many times the course may be taken. Default 1. */
  maxEnrollments?: number
  /**
   * Counts toward a requirement only from this grade on: at Stevenson, an
   * English elective is English credit in senior year and elective credit
   * before it.
   */
  satisfiesFromGrade?: Partial<Record<string, GradeLevel>>
  /**
   * The school places students in it (a test, an audition, an application),
   * or it's an alternative section a student opts into (online, blended).
   * The planner never chooses it on its own; a student can still add it.
   */
  byPlacement?: boolean
  /**
   * The catalog expects something Compass can't check: prior experience, an
   * instrument, a teacher's approval. The notes say what; the planner picks
   * the course only for a student who is interested in it.
   */
  expectsBackground?: boolean
  /** Catalog notes the engine does not enforce. */
  notes?: string[]
  source: SourceRef
}

export interface MustInclude {
  /** Human label, e.g. "World History". */
  label: string
  /** Any one of these courses satisfies the group. */
  anyOf: string[]
}

export interface Requirement {
  id: string
  name: string
  description: string
  credits: number
  /**
   * `category` requirements take credits from courses that list them in
   * `satisfies`. The single `elective` requirement absorbs credits no
   * category needs.
   */
  kind: 'category' | 'elective'
  mustInclude?: MustInclude[]
  /** Credits must come from one sequence (e.g. two years of the same language). */
  sameSequence?: boolean
  source: SourceRef
}

export type Enforcement = 'required' | 'target'

export type Policy =
  | {
      kind: 'every-term'
      id: string
      label: string
      /** Department that must appear every term. */
      department: string
      /**
       * Courses from other departments that fill the term instead (at
       * Stevenson, Driver Education or Dance in place of P.E.).
       */
      alsoCounts?: string[]
      enforcement: Enforcement
      source: SourceRef
    }
  | {
      kind: 'placement'
      id: string
      label: string
      /** Any one of these courses. */
      courseIds: string[]
      grade: GradeLevel
      enforcement: Enforcement
      source: SourceRef
    }
  | {
      kind: 'sequence-continuity'
      id: string
      label: string
      enforcement: Enforcement
      source: SourceRef
    }

export interface Department {
  id: string
  name: string
  /** Mid-sentence name: "math" for Mathematics. Defaults to the lower-cased name. */
  shortName?: string
  /** Display order in the four-year map. */
  order: number
  /** A core lane gets its own row in the map. */
  lane: boolean
}

/**
 * How a school maps "what math did you finish before high school?" to its own
 * catalog. Placement is school data: it decides where the math pathway starts.
 */
export interface MathPlacementOption {
  id: string
  label: string
  /** Courses this answer marks as completed before high school. */
  completes: string[]
  description?: string
}

export interface SchoolConfig {
  id: string
  name: string
  /** Development data that does not describe a real school. */
  isDemo: boolean
  /** Courses per term. `min` is a target; `max` is a hard capacity. */
  load: { min: number; max: number }
  totalCredits: number
  /** Whether courses completed before high school earn high-school credit. */
  preHighSchoolCredit: boolean
  departments: Department[]
  requirements: Requirement[]
  policies: Policy[]
  courses: Course[]
  /** Answers to the onboarding math question, in order. */
  mathPlacement: MathPlacementOption[]
  source: SourceRef
}

export type PlacementStatus = 'completed' | 'in-progress' | 'planned'

export interface Placement {
  courseId: string
  /** Start term. `BEFORE_HIGH_SCHOOL` for pre-high-school completion. */
  term: TermIndex
  status: PlacementStatus
}

/** A student's plan: history plus the future, as placements. */
export interface Plan {
  placements: Placement[]
}

/**
 * Where the student is. `startTerm` is the first term Compass may plan
 * (always the fall of a school year); everything before it is history.
 */
export interface StudentState {
  startTerm: TermIndex
}

export type Rigor = 'balanced' | 'challenging' | 'very-rigorous' | 'maximum'

export type GoalId =
  | 'maximize-rigor'
  | 'stem'
  | 'medicine'
  | 'engineering'
  | 'computer-science'
  | 'business'
  | 'humanities'
  | 'arts'
  | 'explore'
  | 'athletics'
  | 'extracurricular'
  | 'balanced'
  | 'max-ap'
  | 'college'

export type ActivitySeason = 'fall' | 'winter' | 'spring' | 'year-round'

export interface Activity {
  name: string
  kind: 'sport' | 'club' | 'job' | 'other'
  seasons: ActivitySeason[]
  hoursPerWeek: number
}

/** Soft preferences. They shape a plan; they never override a hard constraint. */
export interface Preferences {
  goals: GoalId[]
  rigor: Rigor
  /** "I care more about balance than taking the hardest possible schedule." */
  balanceFirst: boolean
  /** Extra interest tags, e.g. from a career the student described. */
  interests: string[]
  activities: Activity[]
  /** Preferred world-language sequence id, when the student has one. */
  language?: string
  /** Courses the student wants in the plan. */
  targetCourses: string[]
  /** Courses the student does not want. */
  avoidCourses: string[]
  /**
   * The student's own words about goals (a career, a skill). Context for
   * Compass AI only; the generator never reads free text.
   */
  notes?: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  goals: [],
  rigor: 'challenging',
  balanceFirst: false,
  interests: [],
  activities: [],
  targetCourses: [],
  avoidCourses: [],
}
