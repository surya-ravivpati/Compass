import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import {
  buildCatalog,
  DEFAULT_PREFERENCES,
  generatePlan,
  occupiedTerms,
  type Catalog,
  type Course,
  type GenerateResult,
  type Placement,
  type Plan,
  type Preferences,
  type SchoolConfig,
} from '../../lib/engine/index.ts'

export const demo = buildCatalog(DEMO_SCHOOL)

export function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...overrides }
}

/** History for a student who finished `mathId` (a placement option) before high school. */
export function preHighSchool(mathId: string, extra: string[] = []): Placement[] {
  const option = DEMO_SCHOOL.mathPlacement.find((m) => m.id === mathId)
  if (!option) throw new Error(`No math placement "${mathId}"`)
  return [...option.completes, ...extra].map((courseId) => ({ courseId, term: -1, status: 'completed' as const }))
}

export function generateFor(
  mathId: string,
  overrides: Partial<Preferences> = {},
  options: { extra?: string[]; startTerm?: number; history?: Placement[] } = {},
): GenerateResult {
  return generatePlan({
    catalog: demo,
    student: { startTerm: options.startTerm ?? 0 },
    history: [...preHighSchool(mathId, options.extra), ...(options.history ?? [])],
    preferences: prefs(overrides),
  })
}

export function coursesIn(catalog: Catalog, plan: Plan, term: number): Course[] {
  return plan.placements
    .filter((p) => p.term >= 0 && occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(term))
    .map((p) => catalog.courses.get(p.courseId)!)
}

export function termOf(plan: Plan, courseId: string): number | undefined {
  return plan.placements.find((p) => p.courseId === courseId)?.term
}

export const planned = (courseId: string, term: number): Placement => ({ courseId, term, status: 'planned' })
export const completed = (courseId: string, term: number): Placement => ({ courseId, term, status: 'completed' })

/** A tiny school for focused tests. */
export function tinySchool(overrides: Partial<SchoolConfig> = {}): SchoolConfig {
  const src = { kind: 'seed' as const, document: 'test' }
  const c = (id: string, extra: Partial<Course> = {}): Course => ({
    id,
    name: id.toUpperCase(),
    department: 'math',
    description: '',
    credits: 1,
    durationTerms: 2,
    grades: [9, 10, 11, 12],
    seasons: ['fall'],
    prerequisites: [],
    level: 'standard',
    workload: 2,
    tags: [],
    satisfies: ['math'],
    source: src,
    ...extra,
  })
  const before = (id: string) => ({ anyOf: [{ courseId: id, timing: 'before' as const }] })
  return {
    id: 'tiny',
    name: 'Tiny',
    isDemo: true,
    load: { min: 1, max: 3 },
    totalCredits: 4,
    preHighSchoolCredit: false,
    departments: [{ id: 'math', name: 'Math', order: 0, lane: true }],
    requirements: [{ id: 'math', name: 'Math', description: '', credits: 4, kind: 'category', source: src }],
    policies: [],
    courses: [
      c('a'),
      c('b', { prerequisites: [before('a')] }),
      c('c', { prerequisites: [before('b')] }),
      c('d', { prerequisites: [before('c')] }),
    ],
    mathPlacement: [],
    source: src,
    ...overrides,
  }
}
