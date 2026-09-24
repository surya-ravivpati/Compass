import { courseName, type Catalog } from './catalog.ts'
import { indexSpans, prerequisiteIds, type Span } from './prereqs.ts'
import { availabilityProblem } from './terms.ts'
import { TERM_COUNT, type Placement, type PrereqOption, type TermIndex } from './types.ts'

/** Every course that can lead to `courseId`, transitively. */
export function ancestors(catalog: Catalog, courseId: string): Set<string> {
  const out = new Set<string>()
  const stack = [courseId]
  while (stack.length) {
    const id = stack.pop()!
    const course = catalog.courses.get(id)
    if (!course) continue
    for (const pre of prerequisiteIds(course)) {
      if (!out.has(pre)) {
        out.add(pre)
        stack.push(pre)
      }
    }
  }
  return out
}

/** Every course that `courseId` helps open, transitively. */
export function descendants(catalog: Catalog, courseId: string): Set<string> {
  const out = new Set<string>()
  const stack = [courseId]
  while (stack.length) {
    const id = stack.pop()!
    for (const next of catalog.dependents.get(id) ?? []) {
      if (!out.has(next)) {
        out.add(next)
        stack.push(next)
      }
    }
  }
  return out
}

/**
 * Depth of each course in the prerequisite graph: 0 for courses with no
 * prerequisites, otherwise one more than the deepest prerequisite. Used to
 * lay out pathway diagrams left to right.
 */
export function prerequisiteDepths(catalog: Catalog, courseIds?: Iterable<string>): Map<string, number> {
  const ids = new Set(courseIds ?? catalog.courses.keys())
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const visit = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    const course = catalog.courses.get(id)
    let d = 0
    if (course) {
      for (const pre of prerequisiteIds(course)) {
        if (ids.has(pre)) d = Math.max(d, visit(pre) + 1)
      }
    }
    visiting.delete(id)
    depth.set(id, d)
    return d
  }
  for (const id of ids) visit(id)
  return depth
}

export interface Earliest {
  /** First term the course could start, or null if it cannot fit before graduation. */
  term: TermIndex | null
  /** Already completed or in progress; `term` is where it sits. */
  taken: boolean
  /** The prerequisite that pushed the course latest, for explanations. */
  limitedBy?: { courseId: string; timing: PrereqOption['timing'] }
}

/**
 * Earliest possible start for every course, given what is already taken and
 * the first term that can still be planned. Ignores course load on purpose:
 * this answers "is it mathematically reachable", not "will it fit".
 */
export function earliestStarts(catalog: Catalog, taken: Placement[], fromTerm: TermIndex): Map<string, Earliest> {
  const spans = indexSpans(catalog, taken)
  const memo = new Map<string, Earliest>()
  const visiting = new Set<string>()

  const firstAvailable = (courseId: string, from: number): TermIndex | null => {
    const course = catalog.courses.get(courseId)!
    for (let t = Math.max(from, fromTerm, 0); t < TERM_COUNT; t++) {
      if (!availabilityProblem(course, t)) return t
    }
    return null
  }

  const optionBound = (courseDuration: number, option: PrereqOption): number => {
    const takenSpans = spans.get(option.courseId)
    if (takenSpans && takenSpans.length > 0) {
      return boundFromSpans(takenSpans, option, courseDuration, fromTerm)
    }
    const pre = visit(option.courseId)
    if (pre.term === null) return Infinity
    const preDuration = catalog.courses.get(option.courseId)!.durationTerms
    if (option.timing === 'before') return pre.term + preDuration
    if (option.timing === 'before-or-concurrent') return pre.term
    return pre.term - courseDuration + 1
  }

  const visit = (courseId: string): Earliest => {
    const known = memo.get(courseId)
    if (known) return known
    const takenSpans = spans.get(courseId)
    if (takenSpans && takenSpans.length > 0) {
      const result: Earliest = { term: takenSpans[0]!.start, taken: true }
      memo.set(courseId, result)
      return result
    }
    const course = catalog.courses.get(courseId)
    if (!course || visiting.has(courseId)) return { term: null, taken: false }
    visiting.add(courseId)

    let bound = fromTerm
    let limitedBy: Earliest['limitedBy']
    for (const group of course.prerequisites) {
      let groupBound = Infinity
      let groupOption: PrereqOption | undefined
      for (const option of group.anyOf) {
        const b = optionBound(course.durationTerms, option)
        if (!groupOption || b < groupBound || (b === groupBound && option.courseId < groupOption.courseId)) {
          groupBound = b
          groupOption = option
        }
      }
      if (groupBound > bound) {
        bound = groupBound
        limitedBy = groupOption ? { courseId: groupOption.courseId, timing: groupOption.timing } : undefined
      }
    }
    visiting.delete(courseId)
    const term = bound === Infinity ? null : firstAvailable(courseId, bound)
    const result: Earliest = { term, taken: false, ...(limitedBy ? { limitedBy } : {}) }
    memo.set(courseId, result)
    return result
  }

  for (const id of [...catalog.courses.keys()].sort()) visit(id)
  return memo
}

function boundFromSpans(spans: Span[], option: PrereqOption, courseDuration: number, fromTerm: TermIndex): number {
  let best = Infinity
  for (const span of spans) {
    if (option.timing !== 'concurrent') best = Math.min(best, span.end + 1)
    if (option.timing !== 'before' && span.end >= fromTerm && span.start >= 0) {
      best = Math.min(best, Math.max(fromTerm, span.start - courseDuration + 1))
    }
  }
  return best
}

/**
 * The prerequisite chain that sets a course's earliest start, starting from
 * the course and walking back: [AP Calculus BC, AP Precalculus, Algebra 2].
 */
export function limitingChain(catalog: Catalog, earliest: Map<string, Earliest>, courseId: string): string[] {
  const chain = [courseId]
  const seen = new Set(chain)
  let current = earliest.get(courseId)
  while (current?.limitedBy && !seen.has(current.limitedBy.courseId)) {
    const next = current.limitedBy.courseId
    chain.push(next)
    seen.add(next)
    const info = earliest.get(next)
    if (!info || info.taken) break
    current = info
  }
  return chain.filter((id) => catalog.courses.has(id))
}

export function chainNames(catalog: Catalog, chain: string[]): string {
  return [...chain].reverse().map((id) => courseName(catalog, id)).join(' → ')
}
