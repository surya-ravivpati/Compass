import type { Catalog } from './catalog.ts'
import { joinAnd } from './prereqs.ts'
import { occupiedTerms, seasonOfTerm, termLabel } from './terms.ts'
import { TERM_COUNT, type Activity, type Plan, type Preferences, type TermIndex } from './types.ts'

export type WorkloadLevel = 'light' | 'moderate' | 'heavy' | 'intense'

export interface TermWorkload {
  term: TermIndex
  courses: number
  /** Sum of catalog workload estimates (1-4 per course). */
  intensity: number
  labs: string[]
  advanced: string[]
  level: WorkloadLevel
}

export interface WorkloadNote {
  term: TermIndex
  text: string
}

/**
 * How heavy each term looks, from the catalog's workload estimates, plus
 * plain tradeoff notes. Notes inform; they never block a plan, because no
 * school rule forbids a heavy semester.
 */
export function analyzeWorkload(
  catalog: Catalog,
  plan: Plan,
  prefs?: Pick<Preferences, 'activities' | 'balanceFirst'>,
): { terms: TermWorkload[]; notes: WorkloadNote[] } {
  const terms: TermWorkload[] = []
  for (let term = 0; term < TERM_COUNT; term++) {
    const here = plan.placements
      .filter((p) => p.term >= 0 && catalog.courses.has(p.courseId))
      .filter((p) => occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(term))
      .map((p) => catalog.courses.get(p.courseId)!)
    const intensity = here.reduce((n, c) => n + c.workload, 0)
    terms.push({
      term,
      courses: here.length,
      intensity,
      labs: here.filter((c) => c.lab).map((c) => c.name),
      advanced: here.filter((c) => c.level === 'ap' || c.level === 'post-ap').map((c) => c.name),
      level: intensity <= 12 ? 'light' : intensity <= 17 ? 'moderate' : intensity <= 21 ? 'heavy' : 'intense',
    })
  }

  const notes: WorkloadNote[] = []
  for (const t of terms) {
    const busy = activitiesIn(prefs?.activities ?? [], t.term)
    const during = busy.length ? ` alongside ${joinAnd(busy.map((a) => a.name))}` : ''
    if (t.labs.length >= 3) {
      notes.push({
        term: t.term,
        text: `${termLabel(t.term)} has ${t.labs.length} lab courses (${joinAnd(t.labs)})${during}. Lab courses add weekly lab time and write-ups.`,
      })
    } else if (t.advanced.length >= 4) {
      notes.push({
        term: t.term,
        text: `${termLabel(t.term)} has ${t.advanced.length} AP or college-level courses${during}. That's a heavy reading and homework load.`,
      })
    } else if (busy.length && (t.level === 'heavy' || t.level === 'intense')) {
      notes.push({
        term: t.term,
        text: `${termLabel(t.term)} is one of your heavier semesters, and it overlaps ${joinAnd(busy.map((a) => a.name))}.`,
      })
    } else if (prefs?.balanceFirst && t.level === 'intense') {
      notes.push({ term: t.term, text: `${termLabel(t.term)} is heavier than a balanced semester usually is.` })
    }
  }
  return { terms, notes }
}

function activitiesIn(activities: Activity[], term: TermIndex): Activity[] {
  const season = seasonOfTerm(term)
  return activities.filter((a) =>
    a.seasons.some(
      (s) => s === 'year-round' || s === 'winter' || (s === 'fall' && season === 'fall') || (s === 'spring' && season === 'spring'),
    ),
  )
}
