import { describe, expect, it } from 'vitest'
import {
  allocateRequirements,
  applyEdit,
  diffPlans,
  explainPlacement,
  previewEdit,
  runScenario,
  whyNot,
  type Plan,
} from '../../lib/engine/index.ts'
import { demo, generateFor, planned, prefs, preHighSchool, termOf } from './helpers.ts'

const student = { startTerm: 0 }

describe('explanations', () => {
  const result = generateFor('algebra-1', { rigor: 'challenging', goals: ['stem'] })
  const plan = result.plan
  const progress = allocateRequirements(demo, plan.placements)
  const explain = (courseId: string) => {
    const placement = plan.placements.find((p) => p.courseId === courseId)!
    return explainPlacement(demo, student, plan, placement, { reasons: result.reasons[`${courseId}@${placement.term}`], progress })
  }

  it('explains a course by the prerequisite that sets its term', () => {
    const math2 = plan.placements.find((p) => ['algebra-2', 'honors-algebra-2'].includes(p.courseId))!
    const name = demo.courses.get(math2.courseId)!.name
    const geo = plan.placements.find((p) => ['geometry', 'honors-geometry'].includes(p.courseId))!
    const geoName = demo.courses.get(geo.courseId)!.name
    expect(explain(math2.courseId).headline).toBe(
      `${name} is in sophomore year because it needs ${geoName} first, and your plan has ${geoName} in freshman year.`,
    )
  })

  it('explains a policy placement', () => {
    const wh = plan.placements.find((p) => p.courseId.includes('world-history'))!
    const name = demo.courses.get(wh.courseId)!.name
    expect(explain(wh.courseId).headline).toBe(
      `${name} is in freshman year because your school’s default sequence places World History in freshman year.`,
    )
  })

  it('lists prerequisites, requirement credit, and what the course opens', () => {
    const e = explain('algebra-1')
    expect(e.headline).toBe('You completed Algebra 1 before high school.')
    const geo = plan.placements.find((p) => ['geometry', 'honors-geometry'].includes(p.courseId))!
    const g = explain(geo.courseId)
    expect(g.facts.some((f) => f.kind === 'prerequisite' && f.text.startsWith('Needs Algebra 1. Covered by Algebra 1 (before high school)'))).toBe(true)
    expect(g.countsToward).toEqual([{ requirementId: 'math', name: 'Mathematics', credits: 1 }])
    expect(g.unlocks.map((u) => u.courseId)).toContain('algebra-2')
  })

  it('warns what moving a course later would break', () => {
    const geo = plan.placements.find((p) => ['geometry', 'honors-geometry'].includes(p.courseId))!
    const g = explain(geo.courseId)
    expect(g.facts.find((f) => f.kind === 'consequence')?.text).toMatch(/^Moving .*Geometry a year later would push .* ahead of/)
  })
})

describe('why not', () => {
  it('walks the prerequisite chain', () => {
    const plan: Plan = { placements: preHighSchool('algebra-1') }
    const w = whyNot(demo, student, plan, 'ap-calculus-bc')
    expect(w.reachable).toBe(true)
    expect(w.chain).toEqual(['geometry', 'algebra-2', 'ap-precalculus', 'ap-calculus-bc'])
    expect(w.explanation).toBe(
      'AP Calculus BC needs AP Precalculus first, which comes after Algebra 2, which comes after Geometry. From where you are now, the earliest it can start is senior year.',
    )
  })

  it('explains an impossible course', () => {
    const plan: Plan = { placements: preHighSchool('algebra-1') }
    const w = whyNot(demo, { startTerm: 4 }, plan, 'multivariable-calculus')
    expect(w.reachable).toBe(false)
    expect(w.explanation).toMatch(/^Multivariable Calculus can't fit before graduation\. It sits at the end of a chain/)
  })

  it('names the blockers for a specific term', () => {
    const plan: Plan = { placements: preHighSchool('algebra-1') }
    const w = whyNot(demo, student, plan, 'ap-chemistry', 0)
    expect(w.blockers).toContain('AP Chemistry is open to grades 11–12, not 9th grade.')
    expect(w.blockers.some((b) => b.startsWith('AP Chemistry needs Chemistry or Honors Chemistry first'))).toBe(true)
  })
})

describe('editing with downstream consequences', () => {
  const pr = prefs({ rigor: 'very-rigorous', goals: ['stem'] })
  const base = generateFor('geometry', pr).plan

  it('moving a prerequisite later names the courses it breaks and proposes a cascade', () => {
    const precalc = base.placements.find((p) => p.courseId === 'ap-precalculus')!
    const preview = previewEdit(demo, student, base, { kind: 'move', courseId: 'ap-precalculus', fromTerm: precalc.term, toTerm: precalc.term + 2 }, pr)
    expect(preview.summary).toBe(`Moved AP Precalculus to ${['freshman', 'sophomore', 'junior', 'senior'][(precalc.term + 2) / 2]} year`)
    expect(preview.affected.map((a) => a.courseId)).toContain('ap-calculus-bc')
    expect(preview.cascade).not.toBeNull()
    expect(preview.cascade!.changes.find((m) => m.kind === 'move' && m.courseId === 'ap-calculus-bc')).toBeDefined()
    expect(preview.cascade!.summary).toMatch(/^Also move AP Calculus BC to senior year/)
    // The proposal is a complete, valid plan that keeps the student's move.
    expect(preview.cascade!.validation.graduationPathValid).toBe(true)
    expect(preview.cascade!.plan.placements.find((p) => p.courseId === 'ap-precalculus')?.term).toBe(precalc.term + 2)
    // The cascade is only proposed: the edited plan itself still shows the conflict.
    expect(preview.after.graduationPathValid).toBe(false)
  })

  it('a harmless move has no consequences', () => {
    const health = base.placements.find((p) => p.courseId === 'health')!
    const other = health.term === 2 ? 3 : 2
    const preview = previewEdit(demo, student, base, { kind: 'move', courseId: 'health', fromTerm: health.term, toTerm: other }, pr)
    expect(preview.affected).toEqual([])
    expect(preview.cascade).toBeNull()
  })

  it('refuses to edit history', () => {
    expect(() => applyEdit(base, { kind: 'remove', courseId: 'geometry', term: -1 })).toThrow()
  })

  it('diffs plans', () => {
    const next = applyEdit(base, { kind: 'remove', courseId: 'health', term: termOf(base, 'health')! })
    const diff = diffPlans(base, next)
    expect(diff.removed.map((p) => p.courseId)).toEqual(['health'])
    expect(diff.added).toEqual([])
  })
})

describe('what-if scenarios', () => {
  const pr = prefs({ rigor: 'maximum', goals: ['medicine'] })
  const current = generateFor('geometry', pr).plan

  it('AP Physics 1 instead of AP Chemistry: shows consequences without ranking', () => {
    expect(current.placements.some((p) => p.courseId === 'ap-chemistry')).toBe(true)
    const result = runScenario(demo, student, pr, current, { kind: 'replace', courseId: 'ap-chemistry', withCourseId: 'ap-physics-1' })
    expect(result.title).toBe('AP Physics 1 instead of AP Chemistry')
    expect(result.status).toBe('valid')
    expect(result.plan.placements.some((p) => p.courseId === 'ap-chemistry')).toBe(false)
    expect(result.plan.placements.some((p) => p.courseId === 'ap-physics-1')).toBe(true)
    expect(result.comparison.diff.removed.map((p) => p.courseId)).toContain('ap-chemistry')
    expect(result.comparison.validity.after).not.toBe('invalid')
    expect(JSON.stringify(result)).not.toMatch(/\b(better|best|worse|recommend)/i)
  })

  it('replacing with a course already in the plan still works', () => {
    const inPlan = current.placements.find((p) => p.courseId === 'ap-environmental-science')
    if (!inPlan) return
    const result = runScenario(demo, student, pr, current, { kind: 'replace', courseId: 'ap-chemistry', withCourseId: 'ap-environmental-science' })
    expect(result.status).toBe('valid')
  })

  it('dropping a language the student still needs cannot produce a valid plan', () => {
    const lang = current.placements.filter((p) => p.status === 'planned' && demo.courses.get(p.courseId)!.department === 'world-language')
    const result = runScenario(demo, student, pr, current, { kind: 'drop', courseIds: lang.map((p) => p.courseId) })
    expect(result.status).toBe('no-valid-schedule')
    expect(result.problems.some((p) => p.requirementId === 'world-language')).toBe(true)
  })

  it('changing priorities regenerates the plan and reports the workload difference', () => {
    const result = runScenario(demo, student, pr, current, { kind: 'preferences', preferences: prefs({ rigor: 'balanced', goals: ['athletics'] }) })
    expect(result.status).toBe('valid')
    const before = result.comparison.workload.reduce((n, w) => n + w.before, 0)
    const after = result.comparison.workload.reduce((n, w) => n + w.after, 0)
    expect(after).toBeLessThan(before)
  })

  it('moving a course applies the cascade in the scenario', () => {
    const bc = current.placements.find((p) => p.courseId === 'ap-precalculus')!
    const result = runScenario(demo, student, pr, current, { kind: 'move', courseId: 'ap-precalculus', toTerm: bc.term + 2 })
    expect(result.comparison.downstream.some((d) => d.text.startsWith('AP Calculus BC moves later'))).toBe(true)
  })

  it('adding a course keeps the core plan and makes room', () => {
    const result = runScenario(demo, student, pr, current, { kind: 'add', courseId: 'ap-seminar' })
    expect(result.status).toBe('valid')
    expect(result.plan.placements.some((p) => p.courseId === 'ap-seminar')).toBe(true)
  })

  it('keeps a planned edit valid for the requirement tracker', () => {
    expect(planned('x', 0).status).toBe('planned')
  })
})
