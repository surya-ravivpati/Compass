import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  DEFAULT_PREFERENCES,
  generatePlan,
  programProgress,
  validateCatalog,
  validatePlan,
  type Plan,
  type Program,
  type SchoolConfig,
} from '../../lib/engine/index.ts'
import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import { planned, preHighSchool } from './helpers.ts'

const program: Program = {
  id: 'state-universities',
  name: 'State universities',
  description: 'What state universities expect beyond graduation.',
  goal: 'college',
  source: { kind: 'catalog', document: 'coursed.pdf', page: 7, quote: 'Strongly encouraged for admission.' },
  requirements: [
    {
      id: 'science',
      name: 'laboratory science',
      description: 'Including physics.',
      credits: 4,
      counts: { departments: ['science'] },
      mustInclude: [{ label: 'a physics course', anyOf: ['physics', 'ap-physics-1', 'ap-physics-2', 'ap-physics-c-mechanics'] }],
    },
    { id: 'language', name: 'world language', description: 'Three years of one language.', credits: 3, counts: { requirements: ['world-language'] } },
  ],
}
const school: SchoolConfig = { ...DEMO_SCHOOL, programs: [program] }
const catalog = buildCatalog(school)
const student = { startTerm: 0 }

describe('a program the school recommends beyond graduation', () => {
  it('counts finished work first, and a course only once', () => {
    const p = programProgress(
      catalog,
      [
        { courseId: 'biology', term: 0, status: 'completed' },
        { courseId: 'chemistry', term: 2, status: 'planned' },
        { courseId: 'spanish-1', term: 0, status: 'completed' },
        { courseId: 'spanish-2', term: 2, status: 'planned' },
      ],
      program,
    )
    const [science, language] = p.requirements
    expect([science!.completed, science!.planned, science!.remaining, science!.status]).toEqual([1, 1, 2, 'missing'])
    expect(science!.mustInclude[0]!.satisfiedBy).toBeNull()
    expect([language!.completed, language!.planned, language!.remaining]).toEqual([1, 1, 1])
    expect(p.covered).toBe(false)
  })

  it('asks only students who chose its goal, in words they can act on', () => {
    const plan: Plan = { placements: [planned('biology', 0), planned('spanish-1', 0), planned('spanish-2', 2)] }
    const quiet = validatePlan(catalog, student, plan, { targetCourses: [], goals: ['arts'] })
    expect(quiet.findings.some((f) => f.code.startsWith('program-'))).toBe(false)
    // Still measured, so every student can see how close they are.
    expect(quiet.programs[0]!.program.id).toBe('state-universities')

    const asked = validatePlan(catalog, student, plan, { targetCourses: [], goals: ['college'] })
    const messages = asked.findings.filter((f) => f.code.startsWith('program-')).map((f) => f.message)
    expect(messages).toEqual([
      "State universities expect a physics course, and your plan doesn't include one.",
      'State universities expect 4 credits of laboratory science; your plan has 1 credit.',
      'State universities expect 3 credits of world language; your plan has 2 credits.',
    ])
    expect(asked.findings.filter((f) => f.code.startsWith('program-')).every((f) => f.severity === 'warning')).toBe(true)
  })

  it('never decides whether a plan graduates', () => {
    const r = generatePlan({ catalog, student, history: preHighSchool('algebra-1'), preferences: { ...DEFAULT_PREFERENCES, goals: ['arts'] } })
    expect(r.status).toBe('valid')
    const asked = validatePlan(catalog, student, r.plan, { targetCourses: [], goals: ['college'] })
    expect(asked.graduationPathValid).toBe(true)
  })

  it('is what the planner aims for when the student chooses its goal', () => {
    const r = generatePlan({ catalog, student, history: preHighSchool('algebra-1'), preferences: { ...DEFAULT_PREFERENCES, goals: ['college'] } })
    expect(r.status).toBe('valid')
    expect(r.validation.programs[0]!.covered).toBe(true)
    expect(r.validation.findings.some((f) => f.code.startsWith('program-'))).toBe(false)
    const physics = r.plan.placements.find((p) => program.requirements[0]!.mustInclude![0]!.anyOf.includes(p.courseId))
    expect(physics).toBeDefined()
  })

  it('refuses a program that points at nothing', () => {
    const broken: SchoolConfig = {
      ...DEMO_SCHOOL,
      programs: [
        {
          ...program,
          goal: 'fame' as Program['goal'],
          requirements: [
            { id: 'x', name: 'x', description: '', credits: 2, counts: { requirements: ['astrology'], departments: ['alchemy'] }, mustInclude: [{ label: 'y', anyOf: ['potions'] }] },
            { id: 'z', name: 'z', description: '', credits: 0, counts: {} },
          ],
        },
      ],
    }
    expect(validateCatalog(broken).filter((i) => i.path.startsWith('programs.')).map((i) => i.message)).toEqual([
      'Unknown goal "fame".',
      'Unknown requirement "astrology".',
      'Unknown department "alchemy".',
      'Unknown course "potions".',
      'Credits must be greater than zero.',
      'Nothing counts toward it: name requirements or departments.',
    ])
  })
})
