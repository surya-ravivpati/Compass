import type { Catalog } from './catalog.ts'
import {
  BEFORE_HIGH_SCHOOL,
  type Course,
  type MustInclude,
  type Placement,
  type PlacementStatus,
  type Requirement,
  type TermIndex,
} from './types.ts'

/** Credits are allocated in hundredths so fractional credits stay exact. */
const UNIT = 100
const toUnits = (credits: number) => Math.round(credits * UNIT)
const toCredits = (units: number) => units / UNIT

export interface Allocation {
  requirementId: string
  courseId: string
  term: TermIndex
  status: PlacementStatus
  credits: number
}

export type RequirementStatus = 'complete' | 'in-progress' | 'on-track' | 'missing'

export interface MustIncludeResult {
  group: MustInclude
  /** The placement counted for the group, if the plan has one. */
  satisfiedBy: { courseId: string; term: TermIndex; status: PlacementStatus } | null
}

export interface RequirementProgress {
  requirement: Requirement
  required: number
  completed: number
  inProgress: number
  planned: number
  /** Credits the plan does not cover yet. */
  remaining: number
  /**
   * `complete` only when completed coursework covers it -- planned work never
   * counts as met.
   */
  status: RequirementStatus
  allocations: Allocation[]
  mustInclude: MustIncludeResult[]
  /** For same-sequence requirements, the sequence being counted. */
  sequenceId?: string
}

export interface CreditTotals {
  required: number
  completed: number
  inProgress: number
  planned: number
  remaining: number
  status: RequirementStatus
}

export interface ProgressReport {
  requirements: RequirementProgress[]
  total: CreditTotals
  /** Credits beyond what every requirement needs. */
  extra: Allocation[]
}

interface Entry {
  key: string
  courseId: string
  term: TermIndex
  status: PlacementStatus
  units: number
  left: number
}

const STATUS_RANK: Record<PlacementStatus, number> = { completed: 0, 'in-progress': 1, planned: 2 }

/**
 * Credits a placement earns toward graduation. Pre-high-school work earns
 * none unless the school grants it; it still satisfies prerequisites.
 */
export function creditsFor(catalog: Catalog, placement: Placement): number {
  const course = catalog.courses.get(placement.courseId)
  if (!course) return 0
  if (placement.term === BEFORE_HIGH_SCHOOL && !catalog.school.preHighSchoolCredit) return 0
  return course.credits
}

/**
 * Whether a course taken in `term` counts toward a requirement: it must list
 * the requirement, and some count only from a grade on (see
 * `satisfiesFromGrade`). Work before high school counts from no grade.
 */
export function countsTowardAt(course: Course, requirementId: string, term: TermIndex): boolean {
  if (!course.satisfies.includes(requirementId)) return false
  const from = course.satisfiesFromGrade?.[requirementId]
  return from === undefined || (term >= 0 && Math.floor(term / 2) + 9 >= from)
}

/**
 * Allocates every placement's credits to requirements and reports progress.
 *
 * Deterministic in three stages: named "must include" courses go to their
 * requirement first; a max-flow then fills category requirements, adding
 * completed, then in-progress, then planned credits so finished work counts
 * first; whatever is left fills the elective requirement.
 */
export function allocateRequirements(catalog: Catalog, placements: Placement[]): ProgressReport {
  const requirements = catalog.school.requirements
  const entries: Entry[] = placements
    .map((p, i) => {
      const units = toUnits(creditsFor(catalog, p))
      return { key: `${p.courseId}@${p.term}#${i}`, courseId: p.courseId, term: p.term, status: p.status, units, left: units }
    })
    .filter((e) => e.units > 0)
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.term - b.term || a.courseId.localeCompare(b.courseId))

  const need = new Map(requirements.map((r) => [r.id, toUnits(r.credits)]))
  const alloc = new Map<string, Map<string, number>>() // requirementId -> entryKey -> units
  const give = (reqId: string, entry: Entry, units: number) => {
    if (units <= 0) return
    entry.left -= units
    need.set(reqId, need.get(reqId)! - units)
    const byEntry = alloc.get(reqId) ?? new Map<string, number>()
    byEntry.set(entry.key, (byEntry.get(entry.key) ?? 0) + units)
    alloc.set(reqId, byEntry)
  }

  // Same-sequence requirements count one sequence only: the one with the most
  // credits, preferring finished work, then the earlier start.
  const sequenceFor = new Map<string, string>()
  for (const req of requirements) {
    if (!req.sameSequence) continue
    const bySequence = new Map<string, { units: number; completed: number; first: number }>()
    for (const e of entries) {
      const course = catalog.courses.get(e.courseId)!
      if (!course.satisfies.includes(req.id)) continue
      const seq = course.sequence?.id ?? `course:${course.id}`
      const s = bySequence.get(seq) ?? { units: 0, completed: 0, first: Infinity }
      s.units += e.units
      if (e.status === 'completed') s.completed += e.units
      s.first = Math.min(s.first, e.term)
      bySequence.set(seq, s)
    }
    const best = [...bySequence.entries()].sort(
      ([ida, a], [idb, b]) => b.units - a.units || b.completed - a.completed || a.first - b.first || ida.localeCompare(idb),
    )[0]
    if (best) sequenceFor.set(req.id, best[0])
  }

  const eligible = (req: Requirement, e: Entry): boolean => {
    const course = catalog.courses.get(e.courseId)!
    if (!countsTowardAt(course, req.id, e.term)) return false
    const seq = sequenceFor.get(req.id)
    if (seq !== undefined) return (course.sequence?.id ?? `course:${course.id}`) === seq
    return true
  }

  // 1. Must-include courses count toward the requirement that names them.
  const mustIncludeResults = new Map<string, MustIncludeResult[]>()
  for (const req of requirements) {
    const results: MustIncludeResult[] = []
    for (const group of req.mustInclude ?? []) {
      const entry = entries.find((e) => group.anyOf.includes(e.courseId) && eligible(req, e) && e.left > 0)
      if (entry) {
        give(req.id, entry, Math.min(entry.left, Math.max(need.get(req.id)!, 0)))
        results.push({ group, satisfiedBy: { courseId: entry.courseId, term: entry.term, status: entry.status } })
      } else {
        // A course already counted for this requirement can still satisfy the
        // group (for example, one course named in two groups).
        const counted = entries.find((e) => group.anyOf.includes(e.courseId) && eligible(req, e))
        results.push({
          group,
          satisfiedBy: counted ? { courseId: counted.courseId, term: counted.term, status: counted.status } : null,
        })
      }
    }
    mustIncludeResults.set(req.id, results)
  }

  // 2. Max-flow from placements to category requirements, in status phases.
  const categories = requirements.filter((r) => r.kind === 'category')
  const flow = new FlowNetwork()
  const SOURCE = 'source'
  const SINK = 'sink'
  for (const req of categories) flow.addEdge(`r:${req.id}`, SINK, Math.max(need.get(req.id)!, 0))
  for (const phase of ['completed', 'in-progress', 'planned'] as const) {
    for (const e of entries.filter((x) => x.status === phase && x.left > 0)) {
      flow.addEdge(SOURCE, `e:${e.key}`, e.left)
      for (const req of categories) if (eligible(req, e)) flow.addEdge(`e:${e.key}`, `r:${req.id}`, Infinity)
    }
    flow.maxFlow(SOURCE, SINK)
  }
  for (const e of entries) {
    for (const req of categories) {
      const units = flow.flowOn(`e:${e.key}`, `r:${req.id}`)
      if (units > 0) give(req.id, e, units)
    }
  }

  // 3. Leftover credit fills the elective requirement, then counts as extra.
  const elective = requirements.find((r) => r.kind === 'elective')
  const extra: Allocation[] = []
  for (const e of entries) {
    if (e.left <= 0) continue
    if (elective && need.get(elective.id)! > 0) give(elective.id, e, Math.min(e.left, need.get(elective.id)!))
    if (e.left > 0) {
      extra.push({ requirementId: '', courseId: e.courseId, term: e.term, status: e.status, credits: toCredits(e.left) })
    }
  }

  const byKey = new Map(entries.map((e) => [e.key, e]))
  const progress = requirements.map((req): RequirementProgress => {
    const allocations: Allocation[] = [...(alloc.get(req.id) ?? new Map<string, number>()).entries()]
      .map(([key, units]) => {
        const e = byKey.get(key)!
        return { requirementId: req.id, courseId: e.courseId, term: e.term, status: e.status, credits: toCredits(units) }
      })
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.term - b.term || a.courseId.localeCompare(b.courseId))
    const sum = (s: PlacementStatus) => allocations.filter((a) => a.status === s).reduce((n, a) => n + a.credits, 0)
    const completed = round(sum('completed'))
    const inProgress = round(sum('in-progress'))
    const planned = round(sum('planned'))
    const mustInclude = mustIncludeResults.get(req.id) ?? []
    const remaining = round(Math.max(0, req.credits - completed - inProgress - planned))
    return {
      requirement: req,
      required: req.credits,
      completed,
      inProgress,
      planned,
      remaining,
      status: statusOf(req.credits, completed, inProgress, planned, mustInclude),
      allocations,
      mustInclude,
      ...(sequenceFor.has(req.id) && !sequenceFor.get(req.id)!.startsWith('course:')
        ? { sequenceId: sequenceFor.get(req.id)! }
        : {}),
    }
  })

  const totalOf = (s: PlacementStatus) => round(entries.filter((e) => e.status === s).reduce((n, e) => n + toCredits(e.units), 0))
  const totalCompleted = totalOf('completed')
  const totalInProgress = totalOf('in-progress')
  const totalPlanned = totalOf('planned')
  const totalRequired = catalog.school.totalCredits
  return {
    requirements: progress,
    total: {
      required: totalRequired,
      completed: totalCompleted,
      inProgress: totalInProgress,
      planned: totalPlanned,
      remaining: round(Math.max(0, totalRequired - totalCompleted - totalInProgress - totalPlanned)),
      status: statusOf(totalRequired, totalCompleted, totalInProgress, totalPlanned, []),
    },
    extra,
  }
}

function statusOf(
  required: number,
  completed: number,
  inProgress: number,
  planned: number,
  mustInclude: MustIncludeResult[],
): RequirementStatus {
  const groupsWith = (ok: (s: PlacementStatus) => boolean) =>
    mustInclude.every((m) => m.satisfiedBy !== null && ok(m.satisfiedBy.status))
  const eps = 1e-9
  if (completed + eps >= required && groupsWith((s) => s === 'completed')) return 'complete'
  if (completed + inProgress + eps >= required && groupsWith((s) => s !== 'planned')) return 'in-progress'
  if (completed + inProgress + planned + eps >= required && groupsWith(() => true)) return 'on-track'
  return 'missing'
}

function round(n: number): number {
  return Math.round(n * UNIT) / UNIT
}

/**
 * Edmonds-Karp max-flow over string-named nodes. Adjacency is kept in
 * insertion order, so the same input always yields the same flow.
 */
class FlowNetwork {
  private adjacency = new Map<string, string[]>()
  private capacity = new Map<string, number>()
  private flows = new Map<string, number>()

  addEdge(from: string, to: string, cap: number) {
    const key = `${from}\u0000${to}`
    if (!this.capacity.has(key)) {
      this.link(from, to)
      this.link(to, from)
      this.capacity.set(`${to}\u0000${from}`, this.capacity.get(`${to}\u0000${from}`) ?? 0)
    }
    this.capacity.set(key, (this.capacity.get(key) ?? 0) + cap)
  }

  flowOn(from: string, to: string): number {
    return Math.max(0, this.flows.get(`${from}\u0000${to}`) ?? 0)
  }

  maxFlow(source: string, sink: string): number {
    let total = 0
    for (;;) {
      const parent = new Map<string, string>()
      const queue = [source]
      parent.set(source, source)
      while (queue.length && !parent.has(sink)) {
        const node = queue.shift()!
        for (const next of this.adjacency.get(node) ?? []) {
          if (!parent.has(next) && this.residual(node, next) > 0) {
            parent.set(next, node)
            queue.push(next)
          }
        }
      }
      if (!parent.has(sink)) return total
      let bottleneck = Infinity
      for (let v = sink; v !== source; v = parent.get(v)!) {
        bottleneck = Math.min(bottleneck, this.residual(parent.get(v)!, v))
      }
      for (let v = sink; v !== source; v = parent.get(v)!) {
        const u = parent.get(v)!
        this.flows.set(`${u}\u0000${v}`, (this.flows.get(`${u}\u0000${v}`) ?? 0) + bottleneck)
        this.flows.set(`${v}\u0000${u}`, (this.flows.get(`${v}\u0000${u}`) ?? 0) - bottleneck)
      }
      total += bottleneck
    }
  }

  private residual(u: string, v: string): number {
    return (this.capacity.get(`${u}\u0000${v}`) ?? 0) - (this.flows.get(`${u}\u0000${v}`) ?? 0)
  }

  private link(from: string, to: string) {
    const list = this.adjacency.get(from) ?? []
    if (!list.includes(to)) list.push(to)
    this.adjacency.set(from, list)
  }
}
