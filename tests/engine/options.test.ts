import { describe, expect, it } from 'vitest'
import { addOption, moveOptions, replacementOptions, type Plan } from '../../lib/engine/index.ts'
import { demo, generateFor, planned, preHighSchool } from './helpers.ts'

const student = { startTerm: 0 }

describe('move, add, and replace options', () => {
  const plan = generateFor('geometry', { rigor: 'very-rigorous', goals: ['stem'] }).plan

  it('explains why a course cannot move to each term', () => {
    const la = plan.placements.find((p) => p.courseId === 'linear-algebra')
    if (!la) return
    const options = moveOptions(demo, student, plan, la)
    expect(options.find((o) => o.term === 6)).toMatchObject({ ok: false, reason: 'Spring only' })
    expect(options.find((o) => o.term === 1)).toMatchObject({ ok: false, reason: 'Grades 11–12 only' })
  })

  it('only offers fall starts for full-year courses and names what a move would break', () => {
    const precalc = plan.placements.find((p) => p.courseId === 'ap-precalculus')!
    const options = moveOptions(demo, student, plan, precalc)
    expect(options.every((o) => o.term % 2 === 0)).toBe(true)
    const later = options.find((o) => o.term === precalc.term + 2)!
    expect(later.breaks).toContain('AP Calculus BC')
  })

  it('refuses to add a course whose prerequisite is missing, or one already in the plan', () => {
    const base: Plan = { placements: preHighSchool('algebra-1') }
    expect(addOption(demo, student, base, demo.courses.get('ap-chemistry')!, 4)).toMatchObject({
      ok: false,
      reason: 'Needs Chemistry or Honors Chemistry first',
    })
    const withBio: Plan = { placements: [...base.placements, planned('biology', 0)] }
    expect(addOption(demo, student, withBio, demo.courses.get('honors-biology')!, 2)).toMatchObject({ ok: false, reason: 'Repeats Biology' })
  })

  it('offers equivalents first as replacements', () => {
    const eng = plan.placements.find((p) => p.courseId.includes('english-9'))!
    const options = replacementOptions(demo, student, plan, eng)
    expect(options[0]!.course.equivalenceGroup).toBe('english-9')
  })
})
