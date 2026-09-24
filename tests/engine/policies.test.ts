import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  buildPreferenceModel,
  DEFAULT_PREFERENCES,
  generatePlan,
  occupiedTerms,
  validatePlan,
  type Course,
  type Plan,
  type SchoolConfig,
} from '../../lib/engine/index.ts'
import { buildLanes } from '../../lib/engine/generate/lanes.ts'

/**
 * A school shaped like Stevenson's P.E. rule: P.E. every semester with no
 * P.E. credit requirement of its own, Health in the same department, and
 * Driver Education standing in for P.E. in its semester.
 */
function welfareSchool(): SchoolConfig {
  const src = { kind: 'seed' as const, document: 'test' }
  const c = (id: string, extra: Partial<Course>): Course => ({
    id,
    name: id.toUpperCase(),
    department: 'english',
    description: '',
    credits: 1,
    durationTerms: 1,
    grades: [9, 10, 11, 12],
    seasons: ['fall', 'spring'],
    prerequisites: [],
    level: 'standard',
    workload: 2,
    tags: [],
    satisfies: [],
    source: src,
    ...extra,
  })
  const english = (id: string, grade: 9 | 10 | 11 | 12) =>
    c(id, { credits: 2, durationTerms: 2, seasons: ['fall'], grades: [grade], satisfies: ['english'] })
  return {
    id: 'welfare',
    name: 'Welfare High',
    isDemo: true,
    load: { min: 2, max: 3 },
    totalCredits: 16,
    preHighSchoolCredit: false,
    departments: [
      { id: 'english', name: 'English', order: 0, lane: true },
      { id: 'physical-welfare', name: 'Physical Welfare', order: 1, lane: false },
      { id: 'applied-arts', name: 'Applied Arts', order: 2, lane: false },
    ],
    requirements: [
      { id: 'english', name: 'English', description: '', credits: 8, kind: 'category', source: src },
      { id: 'health', name: 'Health', description: '', credits: 1, kind: 'category', source: src },
      { id: 'driver-ed', name: 'Driver Education', description: '', credits: 1, kind: 'category', source: src },
      { id: 'elective', name: 'Electives', description: '', credits: 6, kind: 'elective', source: src },
    ],
    policies: [
      {
        kind: 'every-term',
        id: 'pe-every-semester',
        label: 'P.E. every semester, or Health or Driver Education in its place',
        department: 'physical-welfare',
        alsoCounts: ['driver-ed'],
        enforcement: 'required',
        source: src,
      },
    ],
    courses: [
      english('eng9', 9),
      english('eng10', 10),
      english('eng11', 11),
      english('eng12', 12),
      c('pe', { department: 'physical-welfare', maxEnrollments: 8 }),
      c('health', { department: 'physical-welfare', grades: [10], satisfies: ['health'] }),
      c('driver-ed', { department: 'applied-arts', grades: [10, 11, 12], satisfies: ['driver-ed'] }),
    ],
    mathPlacement: [],
    source: src,
  }
}

const catalog = buildCatalog(welfareSchool())
const student = { startTerm: 0 }

describe('an every-term rule with no credit requirement of its own', () => {
  it('gets its own lane, and Health beside it does not become an every-term course', () => {
    const lanes = buildLanes(catalog, buildPreferenceModel(DEFAULT_PREFERENCES, catalog.school), [])
    expect(lanes.find((l) => l.id === 'health')?.everyTerm).toBe(false)
    const pe = lanes.find((l) => l.id === 'policy:pe-every-semester')!
    expect(pe.everyTerm).toBe(true)
    expect(pe.courseIds).toEqual(['driver-ed', 'health', 'pe'])
  })

  it('plans a physical welfare course, or Driver Education, in every semester', () => {
    const result = generatePlan({ catalog, student, history: [], preferences: DEFAULT_PREFERENCES })
    expect(result.status).toBe('valid')
    const inTerm = (t: number) =>
      result.plan.placements.filter((p) => occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(t)).map((p) => p.courseId)
    for (let t = 0; t < 8; t++) expect(inTerm(t).some((id) => ['pe', 'health', 'driver-ed'].includes(id))).toBe(true)
    expect(result.plan.placements.filter((p) => p.courseId === 'health')).toHaveLength(1)
    expect(result.plan.placements.filter((p) => p.courseId === 'driver-ed')).toHaveLength(1)
  })

  it('counts a course named in alsoCounts toward the term, and still flags an empty one', () => {
    const plan: Plan = {
      placements: [
        ...[0, 2, 4, 6].map((term, i) => ({ courseId: ['eng9', 'eng10', 'eng11', 'eng12'][i]!, term, status: 'planned' as const })),
        ...[0, 1, 3, 4, 5, 7].map((term) => ({ courseId: 'pe', term, status: 'planned' as const })),
        { courseId: 'health', term: 2, status: 'planned' },
      ],
    }
    // Senior fall (term 6) has Driver Education instead of P.E.; senior spring has P.E.
    const withDriverEd = validatePlan(catalog, student, { placements: [...plan.placements, { courseId: 'driver-ed', term: 6, status: 'planned' }] })
    expect(withDriverEd.findings.filter((f) => f.code === 'every-term-gap')).toEqual([])
    const without = validatePlan(catalog, student, plan)
    const gaps = without.findings.filter((f) => f.code === 'every-term-gap')
    expect(gaps.map((f) => [f.term, f.severity])).toEqual([[6, 'error']])
    expect(gaps[0]!.message).toBe('Senior Fall has no physical welfare course. P.E. every semester, or Health or Driver Education in its place.')
  })
})

describe('course rules a real catalog needs', () => {
  // Welfare High plus an English elective that counts as English only in
  // senior year, and an ensemble students audition for.
  const school = welfareSchool()
  const src = school.source
  school.totalCredits = 20
  school.requirements.find((r) => r.kind === 'elective')!.credits = 10
  school.load.max = 4
  school.courses.push(
    { ...school.courses[0]!, id: 'journalism', name: 'Journalism', durationTerms: 1, credits: 1, seasons: ['fall', 'spring'], grades: [9, 10, 11, 12], satisfies: ['english'], satisfiesFromGrade: { english: 12 }, source: src },
    { ...school.courses[0]!, id: 'wind-symphony', name: 'Wind Symphony', department: 'applied-arts', grades: [9, 10, 11, 12], satisfies: [], byPlacement: true, source: src },
  )
  const catalog = buildCatalog(school)

  it('counts an elective toward English only from the grade the school says', () => {
    const plan = (term: number): Plan => ({ placements: [{ courseId: 'journalism', term, status: 'completed' }] })
    const englishCredit = (term: number) =>
      validatePlan(catalog, student, plan(term)).progress.requirements.find((r) => r.requirement.id === 'english')!.completed
    expect(englishCredit(2)).toBe(0) // sophomore fall: an elective credit
    expect(englishCredit(6)).toBe(1) // senior fall: English credit
  })

  it('never picks a course students are placed in, but plans it when asked', () => {
    const plain = generatePlan({ catalog, student, history: [], preferences: DEFAULT_PREFERENCES })
    expect(plain.plan.placements.some((p) => p.courseId === 'wind-symphony')).toBe(false)
    const asked = generatePlan({ catalog, student, history: [], preferences: DEFAULT_PREFERENCES, require: ['wind-symphony'] })
    expect(asked.plan.placements.some((p) => p.courseId === 'wind-symphony')).toBe(true)
  })
})
