import { describe, expect, it } from 'vitest'
import {
  allocateRequirements,
  buildCatalog,
  findPrerequisiteCycle,
  validateCatalog,
  validatePlan,
  type Plan,
} from '../../lib/engine/index.ts'
import { DEMO_SCHOOL } from '../../lib/catalog/demo-school.ts'
import { completed, demo, generateFor, planned, preHighSchool, tinySchool } from './helpers.ts'

const errorsOf = (plan: Plan, startTerm = 0) =>
  validatePlan(demo, { startTerm }, plan).findings.filter((f) => f.severity === 'error')

describe('catalog validation', () => {
  it('accepts the demo catalog', () => {
    expect(validateCatalog(DEMO_SCHOOL).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('names the actual cycle', () => {
    const school = tinySchool()
    school.courses[0]!.prerequisites = [{ anyOf: [{ courseId: 'c', timing: 'before' }] }]
    expect(findPrerequisiteCycle(school.courses)).toEqual(['A', 'C', 'B', 'A'])
    expect(validateCatalog(school).find((i) => i.message.includes('cycle'))?.message).toBe(
      'Prerequisite cycle: A → C → B → A. A course cannot depend on itself.',
    )
  })

  it('rejects unknown prerequisites and full-year courses that start in spring', () => {
    const school = tinySchool()
    school.courses[1]!.prerequisites = [{ anyOf: [{ courseId: 'nope', timing: 'before' }] }]
    school.courses[2]!.seasons = ['spring']
    const messages = validateCatalog(school).map((i) => i.message)
    expect(messages).toContain('Prerequisite "nope" is not in the catalog.')
    expect(messages).toContain('A full-year course must start in the fall only.')
  })
})

describe('plan validation', () => {
  const base = generateFor('algebra-1', { rigor: 'challenging' }).plan

  it('accepts a generated plan', () => {
    expect(errorsOf(base)).toEqual([])
  })

  it('flags a prerequisite taken too late, in plain English', () => {
    const plan: Plan = {
      placements: [...preHighSchool('algebra-1'), planned('algebra-2', 0), planned('geometry', 2)],
    }
    const finding = errorsOf(plan).find((f) => f.code === 'prerequisite-missing' && f.courseId === 'algebra-2')!
    expect(finding.message).toBe(
      'Algebra 2 needs Geometry or Honors Geometry first, but your plan has Geometry in sophomore year, after Algebra 2.',
    )
    expect(finding.fixes?.map((f) => f.label)).toContain('Move Algebra 2 to junior year')
  })

  it('flags a prerequisite that is missing entirely', () => {
    const plan: Plan = { placements: [planned('ap-chemistry', 4)] }
    const finding = errorsOf(plan, 0).find((f) => f.courseId === 'ap-chemistry' && f.code === 'prerequisite-missing')!
    expect(finding.message).toBe('AP Chemistry needs Chemistry or Honors Chemistry first, and neither is in your plan.')
  })

  it('treats a concurrent prerequisite as satisfied in the same year', () => {
    const plan: Plan = {
      placements: [
        ...preHighSchool('geometry'),
        planned('physics', 4),
        planned('ap-precalculus', 2),
        planned('ap-calculus-bc', 6),
        planned('ap-physics-c-mechanics', 6),
      ],
    }
    expect(errorsOf(plan).filter((f) => f.courseId === 'ap-physics-c-mechanics' && f.check === 'prerequisites')).toEqual([])
  })

  it('flags a course offered only in another season', () => {
    const plan: Plan = { placements: [planned('linear-algebra', 6)] }
    const finding = errorsOf(plan).find((f) => f.courseId === 'linear-algebra' && f.check === 'availability')!
    expect(finding.message).toBe('Linear Algebra is only offered in the spring.')
  })

  it('flags a course outside its grade levels', () => {
    const plan: Plan = { placements: [planned('us-history', 2)] }
    const finding = errorsOf(plan).find((f) => f.courseId === 'us-history' && f.check === 'availability')!
    expect(finding.message).toBe('U.S. History is open to 11th graders, not 10th grade.')
  })

  it('flags a full-year course that starts in spring', () => {
    const plan: Plan = { placements: [planned('english-9', 1)] }
    expect(errorsOf(plan).find((f) => f.courseId === 'english-9' && f.check === 'availability')?.message).toBe(
      'English 9 is a full-year course, so it has to start in the fall.',
    )
  })

  it('flags repeated and equivalent courses', () => {
    const plan: Plan = {
      placements: [...preHighSchool('algebra-1'), planned('geometry', 0), planned('honors-geometry', 2), planned('biology', 0), planned('biology', 2)],
    }
    const errors = errorsOf(plan)
    expect(errors.find((f) => f.code === 'repeat-equivalent')?.message).toBe(
      'Honors Geometry covers the same material as Geometry, which you already have in freshman year.',
    )
    expect(errors.find((f) => f.code === 'repeat-course')?.message).toBe(
      'Biology is in your plan twice. You already have it in freshman year.',
    )
  })

  it('flags a course already completed before high school', () => {
    const plan: Plan = { placements: [...preHighSchool('algebra-1'), planned('algebra-1', 0)] }
    expect(errorsOf(plan).find((f) => f.code === 'repeat-course')?.message).toBe(
      'Algebra 1 is in your plan twice. You already completed it before high school.',
    )
  })

  it('enforces the maximum load and warns below the minimum', () => {
    const over: Plan = {
      placements: ['english-9', 'biology', 'world-history', 'spanish-1', 'physical-education', 'art-1', 'concert-band', 'theater-arts'].map((id) =>
        planned(id, 0),
      ),
    }
    const report = validatePlan(demo, { startTerm: 0 }, over)
    expect(report.findings.find((f) => f.code === 'load-over')?.message).toBe(
      'Freshman Fall has 8 courses. Your school allows at most 7 a semester.',
    )
    const under = validatePlan(demo, { startTerm: 0 }, { placements: [planned('english-9', 0)] })
    expect(under.findings.find((f) => f.code === 'load-under' && f.term === 0)?.severity).toBe('warning')
  })

  it('requires math every semester unless no math course is open', () => {
    const noMath: Plan = { placements: base.placements.filter((p) => !(p.term === 6 && demo.courses.get(p.courseId)!.department === 'math')) }
    const gap = validatePlan(demo, { startTerm: 0 }, noMath).findings.find((f) => f.code === 'every-term-gap' && f.term === 6)!
    expect(gap.severity).toBe('error')
    expect(gap.message).toBe('Senior Fall has no math course. Your school’s default plan keeps math in every semester.')
  })

  it('calls a missing math term expected when nothing is left to take', () => {
    // Everything through Differential Equations is done; nothing remains for this spring.
    const plan: Plan = {
      placements: [
        ...preHighSchool('algebra-2'),
        completed('ap-precalculus', 0),
        completed('ap-calculus-bc', 2),
        completed('multivariable-calculus', 4),
        completed('linear-algebra', 5),
        completed('ap-statistics', 4),
        completed('discrete-mathematics', 4),
        completed('financial-algebra', 2),
        planned('differential-equations', 7),
      ],
    }
    const gap = validatePlan(demo, { startTerm: 6 }, plan).findings.find((f) => f.code === 'every-term-gap' && f.term === 6)
    expect(gap?.severity).toBe('info')
  })

  it('warns when World History moves out of freshman year', () => {
    const moved: Plan = {
      placements: base.placements.map((p) => (p.courseId.includes('world-history') ? { ...p, term: 2 } : p)),
    }
    const finding = validatePlan(demo, { startTerm: 0 }, moved).findings.find((f) => f.code === 'placement-off-target')!
    expect(finding.severity).toBe('warning')
    expect(finding.message).toMatch(/is in sophomore year\. Your school’s default sequence places World History in freshman year\.$/)
  })

  it('reports missing graduation requirements', () => {
    const noHealth: Plan = { placements: base.placements.filter((p) => p.courseId !== 'health') }
    const errors = errorsOf(noHealth)
    expect(errors.find((f) => f.code === 'requirement-course-missing' && f.requirementId === 'health')?.message).toBe(
      "Health requires Health, and your plan doesn't include it.",
    )
  })

  it('reports a requirement that can no longer be reached', () => {
    const report = validatePlan(demo, { startTerm: 7 }, { placements: [] })
    expect(report.findings.some((f) => f.check === 'reachability' && f.requirementId === 'english')).toBe(true)
  })

  it('warns when a course the student wants is out of reach', () => {
    const plan: Plan = { placements: preHighSchool('pre-algebra') }
    const report = validatePlan(demo, { startTerm: 4 }, plan, { targetCourses: ['multivariable-calculus'] })
    const finding = report.findings.find((f) => f.code === 'target-unreachable')!
    expect(finding.message).toMatch(/^Multivariable Calculus can't fit before graduation: it needs AP Calculus BC/)
  })
})

describe('requirement allocation', () => {
  it('counts completed work as complete, planned work as on track -- never met', () => {
    const catalog = buildCatalog(tinySchool())
    const progress = allocateRequirements(catalog, [completed('a', 0), completed('b', 2), planned('c', 4), planned('d', 6)])
    const math = progress.requirements[0]!
    expect(math.completed).toBe(2)
    expect(math.planned).toBe(2)
    expect(math.status).toBe('on-track')
    const done = allocateRequirements(catalog, ['a', 'b', 'c', 'd'].map((id, i) => completed(id, i * 2)))
    expect(done.requirements[0]!.status).toBe('complete')
  })

  it('sends overflow credit to electives', () => {
    const plan = generateFor('algebra-1', { rigor: 'maximum' }).plan
    const progress = allocateRequirements(demo, plan.placements)
    const electives = progress.requirements.find((r) => r.requirement.id === 'electives')!
    expect(electives.status).toBe('on-track')
    expect(progress.total.planned).toBeGreaterThanOrEqual(24)
  })

  it('counts two years of one language, not one year each of two', () => {
    const progress = allocateRequirements(demo, [completed('spanish-1', 0), completed('french-1', 2)])
    const wl = progress.requirements.find((r) => r.requirement.id === 'world-language')!
    expect(wl.completed).toBe(1)
    expect(wl.status).toBe('missing')
  })

  it('gives middle-school courses no high-school credit', () => {
    const progress = allocateRequirements(demo, preHighSchool('algebra-2'))
    expect(progress.total.completed).toBe(0)
  })
})
