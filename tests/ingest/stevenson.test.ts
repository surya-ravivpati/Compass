import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCatalog, DEFAULT_PREFERENCES, generatePlan, occupiedTerms, type Placement, type Preferences } from '../../lib/engine/index.ts'
import { buildSchool } from '../../lib/ingest/build.ts'
import type { CatalogOverrides, DraftCatalog } from '../../lib/ingest/types.ts'

const read = <T>(file: string) => JSON.parse(readFileSync(`data/catalogs/stevenson/${file}`, 'utf8')) as T
const built = buildSchool(read<DraftCatalog>('extracted.json'), read<CatalogOverrides>('overrides.json'))
const catalog = buildCatalog(built.school!)
const algebra1: Placement[] = [{ courseId: 'algebra-1', term: -1, status: 'completed' }]

const PROFILES: [string, Placement[], Partial<Preferences>][] = [
  ['Math 8, balanced', [], { rigor: 'balanced', goals: [] }],
  ['Algebra 1 done, engineering, very rigorous', algebra1, { rigor: 'very-rigorous', goals: ['engineering', 'stem'] }],
  ['Math 8, arts', [], { rigor: 'challenging', goals: ['arts'] }],
  ['Algebra 1 done, business and humanities', algebra1, { rigor: 'challenging', goals: ['business', 'humanities'] }],
]

describe('the Stevenson catalog', () => {
  it('builds from the reviewed overrides, and catalog.json is current', () => {
    expect(built.errors).toEqual([])
    expect(built.school).toEqual(read('catalog.json'))
  })

  it('cites a coursebook page for every requirement and policy', () => {
    for (const item of [...built.school!.requirements, ...built.school!.policies]) {
      expect(item.source, item.id).toMatchObject({ kind: 'catalog', document: 'coursed.pdf', page: expect.any(Number), quote: expect.any(String) })
    }
  })

  describe.each(PROFILES)('%s', (_label, history, prefs) => {
    const result = generatePlan({ catalog, student: { startTerm: 0 }, history, preferences: { ...DEFAULT_PREFERENCES, ...prefs } })
    const coursesIn = (term: number) =>
      result.plan.placements.filter((p) => p.term >= 0 && occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(term))

    it('produces a valid plan that meets the school’s semester rules', () => {
      expect(result.status).toBe('valid')
      expect(result.validation.findings.filter((f) => f.severity === 'error' || f.check === 'policies')).toEqual([])
    })

    it('holds six or seven courses a semester, never the same one twice', () => {
      for (let t = 0; t < 8; t++) {
        const ids = coursesIn(t).map((p) => p.courseId)
        expect(ids.length, `term ${t}`).toBeGreaterThanOrEqual(6)
        expect(ids.length, `term ${t}`).toBeLessThanOrEqual(7)
        expect(new Set(ids).size, `term ${t}`).toBe(ids.length)
      }
    })

    it('explains every placement', () => {
      for (const p of result.plan.placements.filter((q) => q.term >= 0)) {
        expect(result.reasons[`${p.courseId}@${p.term}`]?.length, p.courseId).toBeGreaterThan(0)
      }
    })
  })
})
