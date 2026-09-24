import { describe, expect, it } from 'vitest'
import { analyzeWorkload, generatePlan, levelIndex, type GenerateResult } from '../../lib/engine/index.ts'
import { coursesIn, demo, generateFor, planned, prefs, preHighSchool, termOf } from './helpers.ts'

const PROFILES: [string, string, Parameters<typeof generateFor>[1]][] = [
  ['pre-algebra, balanced', 'pre-algebra', { rigor: 'balanced', goals: ['balanced'] }],
  ['algebra 1, engineering, very rigorous', 'algebra-1', { rigor: 'very-rigorous', goals: ['engineering', 'stem'] }],
  ['geometry, medicine, maximum rigor', 'geometry', { rigor: 'maximum', goals: ['medicine', 'maximize-rigor'] }],
  ['honors algebra 2, computer science', 'honors-algebra-2', { rigor: 'challenging', goals: ['computer-science'] }],
  ['algebra 1, humanities, explore', 'algebra-1', { rigor: 'challenging', goals: ['humanities', 'explore', 'college'] }],
  ['algebra 1, athletics', 'algebra-1', {
    rigor: 'balanced',
    goals: ['athletics'],
    activities: [{ name: 'Soccer', kind: 'sport', seasons: ['fall'], hoursPerWeek: 12 }],
  }],
]

describe('four-year generation', () => {
  describe.each(PROFILES)('%s', (_label, mathId, overrides) => {
    const result = generateFor(mathId, overrides)

    it('produces a valid schedule that passes the validator', () => {
      expect(result.status).toBe('valid')
      expect(result.validation.graduationPathValid).toBe(true)
      expect(result.validation.findings.filter((f) => f.severity === 'error')).toEqual([])
    })

    it('plans all eight semesters with 6-7 courses each', () => {
      for (let t = 0; t < 8; t++) {
        const n = coursesIn(demo, result.plan, t).length
        expect(n, `term ${t}`).toBeGreaterThanOrEqual(6)
        expect(n, `term ${t}`).toBeLessThanOrEqual(7)
      }
    })

    it('keeps math in every semester', () => {
      for (let t = 0; t < 8; t++) {
        expect(coursesIn(demo, result.plan, t).some((c) => c.department === 'math'), `term ${t}`).toBe(true)
      }
    })

    it('places World History in freshman year and Health in sophomore year', () => {
      const wh = result.plan.placements.find((p) => ['world-history', 'honors-world-history'].includes(p.courseId))
      expect(wh && wh.term >= 0 && wh.term <= 1).toBe(true)
      const health = termOf(result.plan, 'health')
      expect(health === 2 || health === 3).toBe(true)
    })

    it('meets every graduation requirement', () => {
      for (const r of result.validation.progress.requirements) {
        expect(r.status, r.requirement.id).not.toBe('missing')
      }
    })

    it('takes English every year', () => {
      for (let year = 0; year < 4; year++) {
        expect(coursesIn(demo, result.plan, year * 2).some((c) => c.department === 'english' && c.satisfies.includes('english'))).toBe(true)
      }
    })

    it('studies one world language in consecutive years', () => {
      const lang = result.plan.placements
        .map((p) => ({ p, c: demo.courses.get(p.courseId)! }))
        .filter(({ c }) => c.department === 'world-language')
        .sort((a, b) => a.p.term - b.p.term)
      expect(new Set(lang.map(({ c }) => c.sequence?.id)).size).toBe(1)
      for (let i = 1; i < lang.length; i++) {
        if (lang[i - 1]!.p.term < 0) continue
        expect(lang[i]!.p.term - lang[i - 1]!.p.term).toBe(2)
      }
    })

    it('explains every placement', () => {
      for (const p of result.plan.placements) {
        expect(result.reasons[`${p.courseId}@${p.term}`]?.length, p.courseId).toBeGreaterThan(0)
      }
    })

    it('reports the real planning stages', () => {
      expect(result.stages.map((s) => s.id)).toEqual(['requirements', 'prerequisites', 'availability', 'preferences', 'validation'])
      expect(result.stages.at(-1)!.detail).toContain('no conflicts')
    })
  })

  it('is deterministic', () => {
    const a = generateFor('algebra-1', { goals: ['stem'], rigor: 'very-rigorous' })
    const b = generateFor('algebra-1', { goals: ['stem'], rigor: 'very-rigorous' })
    expect(a.plan).toEqual(b.plan)
    expect(a.reasons).toEqual(b.reasons)
  })
})

describe('math placement from before high school', () => {
  const start = (r: GenerateResult) =>
    r.plan.placements.filter((p) => p.term >= 0 && demo.courses.get(p.courseId)!.department === 'math').sort((a, b) => a.term - b.term)[0]!

  it('starts at Algebra 1 after Pre-Algebra', () => {
    expect(start(generateFor('pre-algebra')).courseId).toBe('algebra-1')
  })

  it('does not repeat Algebra 1 for a student who finished it', () => {
    const r = generateFor('algebra-1')
    expect(r.plan.placements.filter((p) => p.courseId === 'algebra-1').map((p) => p.term)).toEqual([-1])
    expect(['geometry', 'honors-geometry']).toContain(start(r).courseId)
  })

  it('starts at Algebra 2 for a student who finished Geometry', () => {
    const r = generateFor('geometry')
    expect(['algebra-2', 'honors-algebra-2']).toContain(start(r).courseId)
    expect(r.plan.placements.some((p) => p.term >= 0 && ['algebra-1', 'geometry', 'honors-geometry'].includes(p.courseId))).toBe(false)
  })

  it('accelerates past calculus for a student who finished Algebra 2', () => {
    const r = generateFor('honors-algebra-2', { rigor: 'very-rigorous', goals: ['stem'] })
    expect(start(r).courseId).toMatch(/precalculus/)
    const math = r.plan.placements.filter((p) => p.term >= 0 && demo.courses.get(p.courseId)!.department === 'math')
    expect(math.some((p) => demo.courses.get(p.courseId)!.level === 'post-ap')).toBe(true)
  })

  it('earns no high-school credit for middle-school math', () => {
    const r = generateFor('geometry')
    const math = r.validation.progress.requirements.find((x) => x.requirement.id === 'math')!
    expect(math.allocations.every((a) => a.term >= 0)).toBe(true)
  })
})

describe('preferences shape the plan but never its validity', () => {
  const avgLevel = (r: GenerateResult) => {
    const future = r.plan.placements.filter((p) => p.term >= 0)
    return future.reduce((n, p) => n + levelIndex(demo.courses.get(p.courseId)!.level), 0) / future.length
  }

  it('maximum rigor yields more advanced coursework than balanced', () => {
    const max = generateFor('algebra-1', { rigor: 'maximum' })
    const balanced = generateFor('algebra-1', { rigor: 'balanced', balanceFirst: true })
    expect(max.status).toBe('valid')
    expect(balanced.status).toBe('valid')
    expect(avgLevel(max)).toBeGreaterThan(avgLevel(balanced) + 0.5)
  })

  it('balanced students get a lighter plan', () => {
    const max = generateFor('algebra-1', { rigor: 'maximum' })
    const balanced = generateFor('algebra-1', { rigor: 'balanced', balanceFirst: true })
    const total = (r: GenerateResult) => analyzeWorkload(demo, r.plan).terms.reduce((n, t) => n + t.intensity, 0)
    expect(total(balanced)).toBeLessThan(total(max))
  })

  it('maximum rigor fills to seven courses; balanced fills to six', () => {
    const max = generateFor('algebra-1', { rigor: 'maximum' })
    const balanced = generateFor('algebra-1', { rigor: 'balanced' })
    for (let t = 0; t < 8; t++) {
      expect(coursesIn(demo, max.plan, t).length).toBe(7)
      expect(coursesIn(demo, balanced.plan, t).length).toBe(6)
    }
  })

  it('athletics produces workload notes, not prohibitions', () => {
    const activities = [{ name: 'Soccer', kind: 'sport' as const, seasons: ['fall' as const], hoursPerWeek: 15 }]
    const r = generateFor('geometry', { rigor: 'maximum', goals: ['medicine'], activities })
    expect(r.status).toBe('valid')
    const notes = analyzeWorkload(demo, r.plan, { activities, balanceFirst: false }).notes
    expect(notes.every((n) => typeof n.text === 'string')).toBe(true)
  })

  it('includes a course the student asked for', () => {
    const r = generateFor('algebra-1', { targetCourses: ['ap-physics-c-mechanics'], rigor: 'very-rigorous' })
    expect(r.status).toBe('valid')
    expect(termOf(r.plan, 'ap-physics-c-mechanics')).toBeDefined()
  })

  it('continues a language started before high school instead of restarting', () => {
    const r = generateFor('algebra-1', { language: 'french' }, { extra: ['spanish-1'] })
    expect(termOf(r.plan, 'spanish-2')).toBe(0)
    expect(r.plan.placements.some((p) => p.courseId.startsWith('french'))).toBe(false)
  })

  it('uses the preferred language when none is started', () => {
    const r = generateFor('algebra-1', { language: 'french' })
    expect(termOf(r.plan, 'french-1')).toBe(0)
  })
})

describe('students already partway through high school', () => {
  it('never schedules a requirement the student already completed', () => {
    const history = [...preHighSchool('algebra-1')]
    const done = [
      ['english-9', 0], ['geometry', 0], ['biology', 0], ['world-history', 0], ['spanish-1', 0], ['physical-education', 0],
      ['health', 1],
    ] as const
    for (const [id, term] of done) history.push({ courseId: id, term, status: 'completed' })
    const r = generatePlan({ catalog: demo, student: { startTerm: 2 }, history, preferences: prefs() })
    expect(r.status).toBe('valid')
    expect(r.plan.placements.filter((p) => p.courseId === 'health')).toHaveLength(1)
    expect(r.plan.placements.every((p) => p.status !== 'planned' || p.term >= 2)).toBe(true)
  })

  it('recalculates electives when many requirements remain', () => {
    // A junior who has only English and math behind them.
    const history = [...preHighSchool('algebra-1')]
    for (const [id, term] of [['english-9', 0], ['geometry', 0], ['english-10', 2], ['algebra-2', 2]] as const) {
      history.push({ courseId: id, term, status: 'completed' })
    }
    const r = generatePlan({ catalog: demo, student: { startTerm: 4 }, history, preferences: prefs() })
    const electives = r.plan.placements.filter((p) => p.status === 'planned' && demo.courses.get(p.courseId)!.satisfies.length === 0)
    expect(electives.length).toBeLessThanOrEqual(2)
    // Two years can't hold three science credits alongside everything else, so
    // Compass says why rather than inventing a schedule.
    if (r.status !== 'valid') expect(r.problems.length).toBeGreaterThan(0)
  })

  it('reports NO VALID SCHEDULE with reasons when requirements cannot fit', () => {
    const r = generatePlan({ catalog: demo, student: { startTerm: 6 }, history: preHighSchool('pre-algebra'), preferences: prefs() })
    expect(r.status).toBe('no-valid-schedule')
    expect(r.problems.length).toBeGreaterThan(0)
    expect(r.problems.every((p) => p.message.length > 20)).toBe(true)
  })

  it('keeps pinned courses exactly where the student put them', () => {
    const r = generatePlan({
      catalog: demo,
      student: { startTerm: 0 },
      history: preHighSchool('algebra-1'),
      preferences: prefs(),
      pins: [planned('ap-computer-science-principles', 0)],
    })
    expect(r.status).toBe('valid')
    expect(termOf(r.plan, 'ap-computer-science-principles')).toBe(0)
  })
})

describe('students with fewer credits behind them', () => {
  // A sophomore in the middle of 10th grade with a light record: six courses
  // in 9th grade, five and a half in 10th.
  const history = [
    ...preHighSchool('algebra-1'),
    ...(['honors-english-9', 'geometry', 'biology', 'world-history', 'spanish-1', 'physical-education'] as const).map((courseId) => ({ courseId, term: 0, status: 'completed' as const })),
    ...(['honors-english-10', 'algebra-2', 'chemistry', 'spanish-2'] as const).map((courseId) => ({ courseId, term: 2, status: 'in-progress' as const })),
    { courseId: 'health', term: 2, status: 'in-progress' as const },
  ]

  it('raises the load toward the school maximum to reach graduation credits, and says so', () => {
    const r = generatePlan({ catalog: demo, student: { startTerm: 4 }, history, preferences: prefs({ rigor: 'challenging', goals: ['medicine'] }) })
    expect(r.status).toBe('valid')
    expect(r.validation.progress.total.remaining).toBe(0)
    expect(r.notes[0]).toMatch(/^To reach the 24 credits your school requires, Compass planned 7 courses in /)
  })

  it('does not call electives unreachable when seats remain', () => {
    const r = generatePlan({ catalog: demo, student: { startTerm: 4 }, history, preferences: prefs() })
    expect(r.validation.findings.filter((f) => f.code === 'requirement-credits-unreachable')).toEqual([])
  })
})
