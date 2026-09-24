import type { Enforcement, GradeLevel, Level, MathPlacementOption, MustInclude, Policy, Season, SourceRef, Workload } from '../engine/types.ts'

/*
 * The catalog pipeline:
 *
 *   coursed.pdf ──extract──▶ extracted.json (draft: only what the PDF states,
 *                                             with page + quote per course)
 *                ──review──▶ overrides.json (a person supplies what the PDF
 *                                             doesn't say, as school config)
 *                ──build───▶ catalog.json   (a SchoolConfig the engine accepts,
 *                                             or a list of what's still missing)
 */

/** One course as the PDF describes it. Anything the text doesn't state is null. */
export interface DraftCourse {
  id: string
  name: string
  code: string | null
  department: string | null
  description: string | null
  credits: number | null
  length: 'year' | 'semester' | null
  grades: GradeLevel[] | null
  seasons: Season[] | null
  /** Prerequisites as the text names them, in conjunctive normal form. */
  prerequisites: string[][] | null
  prerequisiteText: string | null
  notes: string[]
  source: SourceRef
  /** Anything a reviewer should look at: missing fields, ambiguity, conflicts. */
  flags: string[]
}

export interface DraftRequirement {
  name: string
  credits: number | null
  text: string
  page: number
}

export interface DraftCatalog {
  document: string
  extractedAt: string
  model: string
  pages: number
  courses: DraftCourse[]
  requirements: DraftRequirement[]
}

/** Omit applied to each kind of policy, so kind-specific fields (department, courseIds) survive. */
type PolicyWithout<K extends PropertyKey> = Policy extends infer P ? (P extends Policy ? Omit<P, K> : never) : never

/** A page of the catalog PDF and its exact words. */
export interface CatalogCitation {
  page: number
  quote: string
}

/** What a reviewer supplies. Every value here is school configuration, not catalog text. */
export interface CatalogOverrides {
  school: {
    id: string
    name: string
    load: { min: number; max: number }
    totalCredits: number
    preHighSchoolCredit: boolean
    /**
     * The school's credit rule when course pages don't give a number
     * ("semesters/credits": one credit per semester). A course that states
     * its own credits keeps them.
     */
    creditsPerTerm?: number
  }
  departments: { id: string; name: string; shortName?: string; order: number; lane: boolean; match: string[] }[]
  requirements: {
    id: string
    name: string
    description: string
    credits: number
    kind: 'category' | 'elective'
    /** Departments whose courses count toward it. */
    departments?: string[]
    mustInclude?: MustInclude[]
    sameSequence?: boolean
    /** Where the catalog states it. */
    source?: CatalogCitation
  }[]
  courses?: Record<
    string,
    Partial<{
      durationTerms: 1 | 2
      credits: number
      grades: GradeLevel[]
      seasons: Season[]
      level: Level
      workload: Workload
      satisfies: string[]
      sequence: { id: string; step: number }
      equivalenceGroup: string
      maxEnrollments: number
      satisfiesFromGrade: Partial<Record<string, GradeLevel>>
      byPlacement: boolean
      prerequisites: { courseId: string; timing?: 'before' | 'before-or-concurrent' | 'concurrent' }[][]
      exclude: boolean
    }>
  >
  policies?: (PolicyWithout<'source' | 'enforcement'> & { enforcement?: Enforcement; source?: CatalogCitation })[]
  mathPlacement?: MathPlacementOption[]
}
