import { courseName, type Catalog } from './catalog.ts'
import { ancestors, descendants } from './graph.ts'
import { evaluatePrerequisites, indexSpans, joinAnd } from './prereqs.ts'
import { availabilityProblem, occupiedTerms, placementPhrase } from './terms.ts'
import { generatePlan } from './generate/index.ts'
import { DEFAULT_PREFERENCES, TERM_COUNT, type Placement, type Plan, type Preferences, type StudentState, type TermIndex } from './types.ts'
import { validatePlan, type Finding, type ValidationReport } from './validate.ts'

export type PlanEdit =
  | { kind: 'move'; courseId: string; fromTerm: TermIndex; toTerm: TermIndex }
  | { kind: 'add'; courseId: string; term: TermIndex }
  | { kind: 'remove'; courseId: string; term: TermIndex }
  | { kind: 'replace'; courseId: string; term: TermIndex; withCourseId: string; toTerm?: TermIndex }

export class EditError extends Error {}

/**
 * Applies one edit to planned placements. History (completed and
 * in-progress courses) can't be edited here; that is the student's record.
 */
export function applyEdit(plan: Plan, edit: PlanEdit): Plan {
  const find = (courseId: string, term: TermIndex) =>
    plan.placements.findIndex((p) => p.courseId === courseId && p.term === term)
  const placements = [...plan.placements]
  switch (edit.kind) {
    case 'move': {
      const i = find(edit.courseId, edit.fromTerm)
      if (i < 0) throw new EditError(`${edit.courseId} is not in the plan at term ${edit.fromTerm}.`)
      if (placements[i]!.status !== 'planned') throw new EditError('Completed and in-progress courses cannot be moved.')
      placements[i] = { ...placements[i]!, term: edit.toTerm }
      break
    }
    case 'add':
      placements.push({ courseId: edit.courseId, term: edit.term, status: 'planned' })
      break
    case 'remove': {
      const i = find(edit.courseId, edit.term)
      if (i < 0) throw new EditError(`${edit.courseId} is not in the plan at term ${edit.term}.`)
      if (placements[i]!.status !== 'planned') throw new EditError('Completed and in-progress courses cannot be removed here.')
      placements.splice(i, 1)
      break
    }
    case 'replace': {
      const i = find(edit.courseId, edit.term)
      if (i < 0) throw new EditError(`${edit.courseId} is not in the plan at term ${edit.term}.`)
      if (placements[i]!.status !== 'planned') throw new EditError('Completed and in-progress courses cannot be replaced.')
      placements[i] = { courseId: edit.withCourseId, term: edit.toTerm ?? edit.term, status: 'planned' }
      break
    }
  }
  return { placements }
}

/**
 * One edit in plain English: "Moved …" for the plan's history, "Moving …"
 * while it is still a proposal.
 */
export function describeEdit(catalog: Catalog, edit: PlanEdit, tense: 'done' | 'proposed' = 'done'): string {
  const name = (id: string) => courseName(catalog, id)
  const dur = (id: string) => catalog.courses.get(id)?.durationTerms ?? 1
  const verb = (done: string, proposed: string) => (tense === 'done' ? done : proposed)
  switch (edit.kind) {
    case 'move':
      return `${verb('Moved', 'Moving')} ${name(edit.courseId)} to ${placementPhrase(edit.toTerm, dur(edit.courseId))}`
    case 'add':
      return `${verb('Added', 'Adding')} ${name(edit.courseId)} in ${placementPhrase(edit.term, dur(edit.courseId))}`
    case 'remove':
      return `${verb('Removed', 'Removing')} ${name(edit.courseId)}`
    case 'replace':
      return `${verb('Replaced', 'Replacing')} ${name(edit.courseId)} with ${name(edit.withCourseId)}`
  }
}

export interface CascadeMove {
  courseId: string
  fromTerm: TermIndex
  toTerm: TermIndex
}

/** One step of a proposed follow-up. */
export type CascadeChange =
  | ({ kind: 'move' } & CascadeMove)
  | { kind: 'add'; courseId: string; term: TermIndex; reason: string }
  | { kind: 'remove'; courseId: string; term: TermIndex; reason: string }

export interface Cascade {
  plan: Plan
  changes: CascadeChange[]
  validation: ValidationReport
  summary: string
}

export interface EditPreview {
  edit: PlanEdit
  summary: string
  plan: Plan
  before: ValidationReport
  after: ValidationReport
  /** Errors the edit creates. */
  introduced: Finding[]
  /** Errors the edit fixes. */
  resolved: Finding[]
  /** Other courses the edit breaks, in plain English. */
  affected: { courseId: string; term: TermIndex; message: string }[]
  /** A proposed follow-up that keeps downstream courses valid. Never applied automatically. */
  cascade: Cascade | null
}

/**
 * Previews an edit: validates before and after, names every other course it
 * breaks, and proposes (but does not apply) how to keep the rest valid.
 */
export function previewEdit(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  edit: PlanEdit,
  prefs: Preferences = DEFAULT_PREFERENCES,
): EditPreview {
  const before = validatePlan(catalog, student, plan, prefs)
  const next = applyEdit(plan, edit)
  const after = validatePlan(catalog, student, next, prefs)
  const beforeIds = new Set(before.findings.filter((f) => f.severity === 'error').map((f) => f.id))
  const afterIds = new Set(after.findings.filter((f) => f.severity === 'error').map((f) => f.id))
  const introduced = after.findings.filter((f) => f.severity === 'error' && !beforeIds.has(f.id))
  const resolved = before.findings.filter((f) => f.severity === 'error' && !afterIds.has(f.id))

  const editedId = edit.kind === 'replace' ? edit.withCourseId : edit.courseId
  const editedTerm =
    edit.kind === 'move' ? edit.toTerm : edit.kind === 'replace' ? (edit.toTerm ?? edit.term) : edit.kind === 'add' ? edit.term : null
  const affected = introduced
    .filter((f) => f.check === 'prerequisites' && f.courseId && f.courseId !== editedId && f.term !== undefined)
    .map((f) => ({ courseId: f.courseId!, term: f.term!, message: f.message }))

  let cascade: Cascade | null = null
  if (introduced.length > 0) {
    const locked = new Set(editedTerm === null ? [] : [`${editedId}@${editedTerm}`])
    cascade = replanAround(catalog, student, next, after, locked, edit, prefs)
    if (!cascade && affected.length > 0) {
      // A partial repair is only worth proposing if it leaves fewer problems.
      const repaired = repairDependents(catalog, student, next, locked, prefs)
      if (repaired.changes.length > 0 && errorCount(repaired.validation) < errorCount(after)) cascade = repaired
    }
  }

  return { edit, summary: describeEdit(catalog, edit), plan: next, before, after, introduced, resolved, affected, cascade }
}

/**
 * Re-plans around a student's edit with the generator: the edited course and
 * every untouched course stay exactly where they are; only courses the edit
 * broke, and electives in terms it overfilled, are released for the planner
 * to place again. If that isn't enough, the affected subjects' pathways are
 * released, then electives (kept only if the change stays small). Courses
 * already in the plan stay where they were whenever they can. Returns null
 * when no valid plan keeps the edit.
 */
export function replanAround(
  catalog: Catalog,
  student: StudentState,
  edited: Plan,
  after: ValidationReport,
  locked: Set<string>,
  edit: PlanEdit,
  prefs: Preferences,
): Cascade | null {
  const keyOf = (p: Placement) => `${p.courseId}@${p.term}`
  const history = edited.placements.filter((p) => p.status !== 'planned')
  const planned = edited.placements.filter((p) => p.status === 'planned')
  const broken = new Set(
    after.findings
      .filter((f) => f.check === 'prerequisites' && f.severity === 'error' && f.courseId && f.term !== undefined)
      .map((f) => `${f.courseId}@${f.term}`)
      .filter((k) => !locked.has(k)),
  )
  const brokenIds = new Set([...broken].map((k) => k.slice(0, k.lastIndexOf('@'))))
  const downstream = new Set([...brokenIds].flatMap((id) => [...descendants(catalog, id)]))
  const departmentOf = (id: string) => catalog.courses.get(id)?.department ?? ''
  const editedIds = [...locked].map((k) => k.slice(0, k.lastIndexOf('@')))
  const departments = new Set([...brokenIds, ...editedIds].map(departmentOf))
  const exclude = edit.kind === 'remove' || edit.kind === 'replace' ? [edit.courseId] : []

  // Narrowest first: only what the edit broke; then the affected subjects'
  // whole pathways, so a sequence can re-route around the edit; then
  // electives too, so a full year can make room for a course that moved.
  // Re-placing every elective can reshuffle the whole plan, so that tier only
  // counts when the result stays small: a bigger re-plan belongs in What if?.
  const elective = (id: string) => (catalog.courses.get(id)?.satisfies.length ?? 0) === 0
  const tiers: { seed: (p: Placement) => boolean; maxChanges: number }[] = [
    { seed: (p) => broken.has(keyOf(p)), maxChanges: Infinity },
    { seed: (p) => broken.has(keyOf(p)) || departments.has(departmentOf(p.courseId)), maxChanges: Infinity },
    { seed: (p) => broken.has(keyOf(p)) || departments.has(departmentOf(p.courseId)) || elective(p.courseId), maxChanges: 4 },
  ]
  const tried = new Set<string>()
  for (const { seed, maxChanges } of tiers) {
    const released = releaseFrom(seed)
    // Releasing nothing still lets the planner add what the edit left missing.
    const signature = [...released].map(keyOf).sort().join(',')
    if (tried.has(signature)) continue
    tried.add(signature)
    const pins = planned.filter((p) => !released.has(p))
    const result = generatePlan({ catalog, student, history, preferences: prefs, pins, exclude, anchors: planned })
    if (result.status !== 'valid') continue
    const diff = diffPlans(edited, result.plan)
    const changes: CascadeChange[] = [
      ...diff.moved.map((m) => ({ kind: 'move' as const, ...m })),
      ...diff.added.map((p) => ({ kind: 'add' as const, courseId: p.courseId, term: p.term, reason: 'Fills the gap this change leaves.' })),
      ...diff.removed.map((p) => ({
        kind: 'remove' as const,
        courseId: p.courseId,
        term: p.term,
        reason:
          broken.has(keyOf(p)) || downstream.has(p.courseId)
            ? 'Can no longer fit before graduation after this change.'
            : 'Makes room for this change.',
      })),
    ]
    if (changes.length === 0 || changes.length > maxChanges) continue
    return { plan: result.plan, changes, validation: result.validation, summary: summarizeChanges(catalog, changes) }
  }
  return null

  /** The planned placements handed back to the planner for one tier. */
  function releaseFrom(seed: (p: Placement) => boolean): Set<Placement> {
    const released = new Set(planned.filter((p) => !locked.has(keyOf(p)) && seed(p)))
    // Anything that builds on a released course is released too.
    const builds = new Set([...released].flatMap((p) => [...descendants(catalog, p.courseId)]))
    for (const p of planned) if (!locked.has(keyOf(p)) && builds.has(p.courseId)) released.add(p)
    // Electives make room in terms still over the limit once those are out,
    // unless a course that stays builds on them.
    const kept = planned.filter((p) => !released.has(p))
    const load = new Array<number>(TERM_COUNT).fill(0)
    for (const p of kept) {
      const course = catalog.courses.get(p.courseId)
      if (course) for (const t of occupiedTerms(p.term, course.durationTerms)) if (t >= 0 && t < TERM_COUNT) load[t]! += 1
    }
    const needed = new Set(kept.flatMap((p) => [...ancestors(catalog, p.courseId)]))
    for (const p of kept) {
      if (locked.has(keyOf(p)) || needed.has(p.courseId)) continue
      const course = catalog.courses.get(p.courseId)
      if (!course || course.satisfies.length > 0) continue
      if (occupiedTerms(p.term, course.durationTerms).some((t) => load[t]! > catalog.school.load.max)) released.add(p)
    }
    return released
  }
}

function errorCount(report: ValidationReport): number {
  return report.findings.filter((f) => f.severity === 'error').length
}

function summarizeChanges(catalog: Catalog, changes: CascadeChange[]): string {
  const name = (id: string) => courseName(catalog, id)
  const where = (id: string, term: TermIndex) => placementPhrase(term, catalog.courses.get(id)?.durationTerms ?? 1)
  // In term order, so a chain reads the way it runs.
  const byTerm = (a: { term: TermIndex; courseId: string }, b: { term: TermIndex; courseId: string }) =>
    a.term - b.term || name(a.courseId).localeCompare(name(b.courseId))
  const moves = changes
    .filter((c): c is Extract<CascadeChange, { kind: 'move' }> => c.kind === 'move')
    .sort((a, b) => byTerm({ term: a.fromTerm, courseId: a.courseId }, { term: b.fromTerm, courseId: b.courseId }))
  const adds = changes.filter((c): c is Extract<CascadeChange, { kind: 'add' }> => c.kind === 'add').sort(byTerm)
  const removals = changes.filter((c): c is Extract<CascadeChange, { kind: 'remove' }> => c.kind === 'remove').sort(byTerm)
  const parts: string[] = []
  if (moves.length) parts.push(`move ${joinAnd(moves.map((m) => `${name(m.courseId)} to ${where(m.courseId, m.toTerm)}`))}`)
  if (adds.length) parts.push(`add ${joinAnd(adds.map((a) => `${name(a.courseId)} in ${where(a.courseId, a.term)}`))}`)
  const noFit = removals.filter((r) => r.reason.startsWith('Can no longer'))
  const room = removals.filter((r) => !r.reason.startsWith('Can no longer'))
  if (room.length) parts.push(`make room by dropping ${joinAnd(room.map((r) => name(r.courseId)))}`)
  if (noFit.length) parts.push(`drop ${joinAnd(noFit.map((r) => name(r.courseId)))}, which can no longer fit before graduation`)
  // Two clauses that are lists themselves need the comma to stay readable.
  if (parts.length === 2 && /,| and /.test(parts[0]!)) return `Also ${parts[0]}, and ${parts[1]}`
  return `Also ${joinAnd(parts)}`
}

/**
 * Proposes how to keep a plan valid after an edit breaks prerequisites
 * downstream: each broken course moves to the earliest later term that
 * works, and courses that can no longer fit before graduation are dropped.
 * Deterministic and bounded. It is only ever a proposal.
 */
export function repairDependents(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  locked: Set<string>,
  prefs?: Pick<Preferences, 'targetCourses'>,
): Cascade {
  let current = plan
  // One broken course per round, earliest first. A move that breaks the
  // courses built on it leaves them for the rounds after, which move them
  // with the same care (or drop them when nothing later fits).
  for (let round = 0; round < 32; round++) {
    const report = validatePlan(catalog, student, current, prefs)
    const broken = report.findings
      .filter((f) => f.check === 'prerequisites' && f.severity === 'error' && f.courseId && f.term !== undefined)
      .filter((f) => !locked.has(`${f.courseId}@${f.term}`))
      .sort((a, b) => a.term! - b.term! || a.courseId!.localeCompare(b.courseId!))
    const target = broken[0]
    if (!target) return finish(report)
    const course = catalog.courses.get(target.courseId!)!
    const from = target.term!
    const without = current.placements.filter((p) => !(p.courseId === course.id && p.term === from))
    const spans = indexSpans(catalog, without)
    const downstream = descendants(catalog, course.id)

    let destination: TermIndex | null = null
    for (let t = Math.max(from + 1, student.startTerm); t < TERM_COUNT; t++) {
      if (availabilityProblem(course, t)) continue
      if (!evaluatePrerequisites(course, t, spans).satisfied) continue
      // Courses that build on this one and would break with it here move on
      // anyway, so their seats count as free. One allowed to run alongside it
      // (AP Physics C with AP Calculus BC) stays where it is.
      const spansAt = indexSpans(catalog, [...without, { courseId: course.id, term: t, status: 'planned' }])
      const casualties = without.filter(
        (p) =>
          p.status === 'planned' &&
          downstream.has(p.courseId) &&
          !evaluatePrerequisites(catalog.courses.get(p.courseId)!, p.term, spansAt).satisfied,
      )
      const load = new Array(TERM_COUNT).fill(0)
      for (const p of without) {
        if (casualties.includes(p)) continue
        const c = catalog.courses.get(p.courseId)
        if (c) for (const x of occupiedTerms(p.term, c.durationTerms)) load[x]++
      }
      if (occupiedTerms(t, course.durationTerms).some((x) => load[x] + 1 > catalog.school.load.max)) continue
      destination = t
      break
    }
    current = {
      placements: destination === null ? without : [...without, { courseId: course.id, term: destination, status: 'planned' }],
    }
  }
  return finish(validatePlan(catalog, student, current, prefs))

  function finish(validation: ValidationReport): Cascade {
    // The net change, so a course that moved twice reads as one move.
    const diff = diffPlans(plan, current)
    const changes: CascadeChange[] = [
      ...diff.moved.map((m) => ({ kind: 'move' as const, ...m })),
      ...diff.removed.map((p) => ({
        kind: 'remove' as const,
        courseId: p.courseId,
        term: p.term,
        reason: 'Can no longer fit before graduation after this change.',
      })),
    ]
    return { plan: current, changes, validation, summary: changes.length ? summarizeChanges(catalog, changes) : '' }
  }
}

export interface PlanDiff {
  added: Placement[]
  removed: Placement[]
  moved: CascadeMove[]
}

/** What changed between two plans, matching repeated courses in order. */
export function diffPlans(a: Plan, b: Plan): PlanDiff {
  const group = (plan: Plan) => {
    const map = new Map<string, Placement[]>()
    for (const p of plan.placements) map.set(p.courseId, [...(map.get(p.courseId) ?? []), p])
    for (const list of map.values()) list.sort((x, y) => x.term - y.term)
    return map
  }
  const left = group(a)
  const right = group(b)
  const diff: PlanDiff = { added: [], removed: [], moved: [] }
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort()
  for (const id of ids) {
    const l = [...(left.get(id) ?? [])]
    const r = [...(right.get(id) ?? [])]
    // Unchanged placements first.
    for (const p of [...l]) {
      const j = r.findIndex((q) => q.term === p.term)
      if (j >= 0) {
        l.splice(l.indexOf(p), 1)
        r.splice(j, 1)
      }
    }
    while (l.length && r.length) {
      const from = l.shift()!
      const to = r.shift()!
      diff.moved.push({ courseId: id, fromTerm: from.term, toTerm: to.term })
    }
    diff.removed.push(...l)
    diff.added.push(...r)
  }
  return diff
}

export function isEmptyDiff(diff: PlanDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.moved.length === 0
}
