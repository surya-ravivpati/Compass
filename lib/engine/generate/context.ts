import type { Catalog } from '../catalog.ts'
import { evaluatePrerequisites, overlaySpans, spanOf, type Span, type SpanLookup } from '../prereqs.ts'
import { availabilityProblem, occupiedTerms } from '../terms.ts'
import { TERM_COUNT, type Course, type Placement, type TermIndex } from '../types.ts'

/**
 * The plan under construction: placements, the spans they occupy, how full
 * each term is, and what has been used. Cheap to clone for backtracking.
 */
export class PlanningContext {
  readonly catalog: Catalog
  placements: Placement[] = []
  spans = new Map<string, Span[]>()
  occupancy: number[] = new Array(TERM_COUNT).fill(0)
  counts = new Map<string, number>()
  groups = new Set<string>()

  constructor(catalog: Catalog, placements: Placement[] = []) {
    this.catalog = catalog
    for (const p of placements) this.add(p)
  }

  clone(): PlanningContext {
    const copy = new PlanningContext(this.catalog)
    copy.placements = [...this.placements]
    copy.spans = new Map([...this.spans].map(([k, v]) => [k, [...v]]))
    copy.occupancy = [...this.occupancy]
    copy.counts = new Map(this.counts)
    copy.groups = new Set(this.groups)
    return copy
  }

  add(p: Placement) {
    const course = this.catalog.courses.get(p.courseId)
    if (!course) return
    this.placements.push(p)
    const list = this.spans.get(p.courseId) ?? []
    list.push(spanOf(course, p))
    this.spans.set(p.courseId, list)
    for (const t of occupiedTerms(p.term, course.durationTerms)) this.occupancy[t]! += 1
    this.counts.set(p.courseId, (this.counts.get(p.courseId) ?? 0) + 1)
    if (course.equivalenceGroup) this.groups.add(course.equivalenceGroup)
  }

  has(courseId: string): boolean {
    return (this.counts.get(courseId) ?? 0) > 0
  }
}

/** Placements layered on a context without mutating it (used by the track search). */
export interface Overlay {
  placements: Placement[]
  spans: Span[]
  occupancy: Map<TermIndex, number>
  ids: Map<string, number>
  groups: Set<string>
}

export function emptyOverlay(): Overlay {
  return { placements: [], spans: [], occupancy: new Map(), ids: new Map(), groups: new Set() }
}

export function extendOverlay(catalog: Catalog, overlay: Overlay, p: Placement): Overlay {
  const course = catalog.courses.get(p.courseId)!
  const occupancy = new Map(overlay.occupancy)
  for (const t of occupiedTerms(p.term, course.durationTerms)) occupancy.set(t, (occupancy.get(t) ?? 0) + 1)
  const ids = new Map(overlay.ids)
  ids.set(p.courseId, (ids.get(p.courseId) ?? 0) + 1)
  const groups = new Set(overlay.groups)
  if (course.equivalenceGroup) groups.add(course.equivalenceGroup)
  return {
    placements: [...overlay.placements, p],
    spans: [...overlay.spans, spanOf(course, p)],
    occupancy,
    ids,
    groups,
  }
}

export type Infeasible = 'excluded' | 'taken' | 'availability' | 'capacity' | 'prerequisites'

/**
 * Whether `course` can start at `term` on top of the context and an overlay:
 * the hard constraints only. Returns the first reason it can't, or null.
 */
export function infeasibility(
  ctx: PlanningContext,
  overlay: Overlay,
  course: Course,
  term: TermIndex,
  maxLoad: number,
  excluded: Set<string>,
): Infeasible | null {
  if (excluded.has(course.id)) return 'excluded'
  const taken = (ctx.counts.get(course.id) ?? 0) + (overlay.ids.get(course.id) ?? 0)
  if (taken >= (course.maxEnrollments ?? 1)) return 'taken'
  if (course.equivalenceGroup && (ctx.groups.has(course.equivalenceGroup) || overlay.groups.has(course.equivalenceGroup))) {
    // Repeating the same course (maxEnrollments > 1) is allowed; a different
    // course from the same group is a repeat of its content.
    const sameCourseOnly = (ctx.counts.get(course.id) ?? 0) + (overlay.ids.get(course.id) ?? 0) > 0
    if (!sameCourseOnly) return 'taken'
  }
  if (availabilityProblem(course, term)) return 'availability'
  for (const t of occupiedTerms(term, course.durationTerms)) {
    if (ctx.occupancy[t]! + (overlay.occupancy.get(t) ?? 0) + 1 > maxLoad) return 'capacity'
  }
  const spans: SpanLookup = overlaySpans(ctx.spans, overlay.spans)
  if (!evaluatePrerequisites(course, term, spans).satisfied) return 'prerequisites'
  return null
}

export function loadAt(ctx: PlanningContext, overlay: Overlay, term: TermIndex): number {
  return ctx.occupancy[term]! + (overlay.occupancy.get(term) ?? 0)
}
