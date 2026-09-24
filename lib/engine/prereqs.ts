import type { Catalog } from './catalog.ts'
import { endTerm } from './terms.ts'
import {
  BEFORE_HIGH_SCHOOL,
  type Course,
  type Placement,
  type PlacementStatus,
  type PrereqGroup,
  type PrereqOption,
  type TermIndex,
} from './types.ts'

/** A placement resolved against the catalog, with the span it occupies. */
export interface Span {
  courseId: string
  start: TermIndex
  end: TermIndex
  status: PlacementStatus
}

/** Every placement of every course, for prerequisite lookups. */
export type SpanIndex = Map<string, Span[]>

/** Anything that can look up a course's placements -- a map or an overlay. */
export interface SpanLookup {
  get(courseId: string): Span[] | undefined
}

export function spanOf(course: Course, placement: Placement): Span {
  return {
    courseId: placement.courseId,
    start: placement.term,
    end: endTerm(placement.term, course.durationTerms),
    status: placement.status,
  }
}

/** A read-only view of `base` with extra spans layered on top, without copying. */
export function overlaySpans(base: SpanLookup, extra: Span[]): SpanLookup {
  if (extra.length === 0) return base
  return {
    get(courseId) {
      const own = extra.filter((s) => s.courseId === courseId)
      const under = base.get(courseId)
      if (own.length === 0) return under
      return under ? [...under, ...own] : own
    },
  }
}

export function indexSpans(catalog: Catalog, placements: Placement[]): SpanIndex {
  const index: SpanIndex = new Map()
  for (const p of placements) {
    const course = catalog.courses.get(p.courseId)
    if (!course) continue
    const span: Span = {
      courseId: p.courseId,
      start: p.term,
      end: endTerm(p.term, course.durationTerms),
      status: p.status,
    }
    const list = index.get(p.courseId) ?? []
    list.push(span)
    index.set(p.courseId, list)
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start)
  return index
}

export type SatisfiedHow = 'completed-before' | 'before' | 'concurrent'

export interface OptionMatch {
  option: PrereqOption
  span: Span
  how: SatisfiedHow
}

/**
 * Whether one prerequisite option is met for a course occupying
 * [start, end], using a specific placement of the prerequisite.
 */
export function matchOption(option: PrereqOption, start: TermIndex, end: TermIndex, span: Span): SatisfiedHow | null {
  const finishedBefore = span.end < start
  const overlaps = span.start !== BEFORE_HIGH_SCHOOL && span.start <= end && start <= span.end
  if (option.timing !== 'concurrent' && finishedBefore) {
    return span.status === 'completed' ? 'completed-before' : 'before'
  }
  if (option.timing !== 'before' && overlaps) return 'concurrent'
  return null
}

export interface GroupResult {
  group: PrereqGroup
  index: number
  match: OptionMatch | null
}

export interface PrereqResult {
  satisfied: boolean
  groups: GroupResult[]
}

/**
 * Evaluates a course's prerequisites for a start term against the placements
 * in `spans`. The match chosen for each group is deterministic: the earliest
 * finishing placement, completed work first.
 */
export function evaluatePrerequisites(course: Course, start: TermIndex, spans: SpanLookup): PrereqResult {
  const end = endTerm(start, course.durationTerms)
  const groups = course.prerequisites.map((group, index): GroupResult => {
    let best: OptionMatch | null = null
    for (const option of group.anyOf) {
      for (const span of spans.get(option.courseId) ?? []) {
        if (span.courseId === course.id && span.start === start) continue
        const how = matchOption(option, start, end, span)
        if (!how) continue
        const candidate: OptionMatch = { option, span, how }
        if (!best || rank(candidate) < rank(best)) best = candidate
      }
    }
    return { group, index, match: best }
  })
  return { satisfied: groups.every((g) => g.match !== null), groups }
}

function rank(m: OptionMatch): number {
  const statusRank = m.span.status === 'completed' ? 0 : m.span.status === 'in-progress' ? 1 : 2
  return statusRank * 100 + (m.span.end + 1)
}

/** The prerequisite ids of a course, flattened and de-duplicated. */
export function prerequisiteIds(course: Course): string[] {
  return [...new Set(course.prerequisites.flatMap((g) => g.anyOf.map((o) => o.courseId)))]
}

/** "Algebra 2 or Honors Algebra 2", in catalog order. */
export function describeGroup(catalog: Catalog, group: PrereqGroup): string {
  const names = group.anyOf.map((o) => {
    const name = catalog.courses.get(o.courseId)?.name ?? o.courseId
    if (o.timing === 'concurrent') return `${name} (taken at the same time)`
    if (o.timing === 'before-or-concurrent') return `${name} (before or at the same time)`
    return name
  })
  return joinOr(names)
}

export function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`
}

export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
