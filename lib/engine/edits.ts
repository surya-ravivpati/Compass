import { courseName, type Catalog } from './catalog.ts'
import { descendants } from './graph.ts'
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

export function describeEdit(catalog: Catalog, edit: PlanEdit): string {
  const name = (id: string) => courseName(catalog, id)
  const dur = (id: string) => catalog.courses.get(id)?.durationTerms ?? 1
  switch (edit.kind) {
    case 'move':
      return `Moved ${name(edit.courseId)} to ${placementPhrase(edit.toTerm, dur(edit.courseId))}`
    case 'add':
      return `Added ${name(edit.courseId)} in ${placementPhrase(edit.term, dur(edit.courseId))}`
    case 'remove':
      return `Removed ${name(edit.courseId)}`
    case 'replace':
      return `Replaced ${name(edit.courseId)} with ${name(edit.withCourseId)}`
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
      const repaired = repairDependents(catalog, student, next, locked, prefs)
      if (repaired.changes.length > 0) cascade = repaired
    }
  }

  return { edit, summary: describeEdit(catalog, edit), plan: next, before, after, introduced, resolved, affected, cascade }
}

/**
 * Re-plans around a student's edit with the generator: the edited course and
 * every untouched course stay exactly where they are; only courses the edit
 * broke, and electives in terms it overfilled, are released for the planner
 * to place again. Returns null when no valid plan keeps the edit.
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
  const history = edited.placements.filter((p) => p.status !== 'planned')
  const broken = new Set(
    after.findings
      .filter((f) => f.check === 'prerequisites' && f.severity === 'error' && f.courseId && f.term !== undefined)
      .map((f) => `${f.courseId}@${f.term}`)
      .filter((k) => !locked.has(k)),
  )
  // Anything downstream of a broken course is released too.
  const brokenIds = new Set([...broken].map((k) => k.slice(0, k.lastIndexOf('@'))))
  const downstream = new Set([...brokenIds].flatMap((id) => [...descendants(catalog, id)]))
  const overloaded = new Set(after.findings.filter((f) => f.code === 'load-over' && f.term !== undefined).map((f) => f.term!))
  const pins = edited.placements.filter((p) => {
    if (p.status !== 'planned') return false
    const key = `${p.courseId}@${p.term}`
    if (locked.has(key)) return true
    if (broken.has(key) || downstream.has(p.courseId)) return false
    const course = catalog.courses.get(p.courseId)
    if (!course) return false
    const elective = course.satisfies.length === 0
    if (elective && occupiedTerms(p.term, course.durationTerms).some((t) => overloaded.has(t))) return false
    return true
  })
  const exclude = edit.kind === 'remove' || edit.kind === 'replace' ? [edit.courseId] : []
  const result = generatePlan({ catalog, student, history, preferences: prefs, pins, exclude })
  if (result.status !== 'valid') return null
  const diff = diffPlans(edited, result.plan)
  const changes: CascadeChange[] = [
    ...diff.moved.map((m) => ({ kind: 'move' as const, ...m })),
    ...diff.added.map((p) => ({ kind: 'add' as const, courseId: p.courseId, term: p.term, reason: 'Fills the gap this change leaves.' })),
    ...diff.removed.map((p) => ({
      kind: 'remove' as const,
      courseId: p.courseId,
      term: p.term,
      reason:
        broken.has(`${p.courseId}@${p.term}`) || downstream.has(p.courseId)
          ? 'Can no longer fit before graduation after this change.'
          : 'Makes room for this change.',
    })),
  ]
  if (changes.length === 0) return null
  return { plan: result.plan, changes, validation: result.validation, summary: summarizeChanges(catalog, changes) }
}

function summarizeChanges(catalog: Catalog, changes: CascadeChange[]): string {
  const name = (id: string) => courseName(catalog, id)
  const where = (id: string, term: TermIndex) => placementPhrase(term, catalog.courses.get(id)?.durationTerms ?? 1)
  const moves = changes.filter((c): c is Extract<CascadeChange, { kind: 'move' }> => c.kind === 'move')
  const adds = changes.filter((c): c is Extract<CascadeChange, { kind: 'add' }> => c.kind === 'add')
  const removals = changes.filter((c): c is Extract<CascadeChange, { kind: 'remove' }> => c.kind === 'remove')
  const parts: string[] = []
  if (moves.length) parts.push(`move ${joinAnd(moves.map((m) => `${name(m.courseId)} to ${where(m.courseId, m.toTerm)}`))}`)
  if (adds.length) parts.push(`add ${joinAnd(adds.map((a) => `${name(a.courseId)} in ${where(a.courseId, a.term)}`))}`)
  const noFit = removals.filter((r) => r.reason.startsWith('Can no longer'))
  const room = removals.filter((r) => !r.reason.startsWith('Can no longer'))
  if (room.length) parts.push(`make room by dropping ${joinAnd(room.map((r) => name(r.courseId)))}`)
  if (noFit.length) parts.push(`drop ${joinAnd(noFit.map((r) => name(r.courseId)))}, which can no longer fit before graduation`)
  const text = `Also ${joinAnd(parts)}`
  return text
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
  const changes: CascadeChange[] = []
  for (let round = 0; round < 24; round++) {
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
    let displaced: Placement[] = []
    for (let t = Math.max(from + 1, student.startTerm); t < TERM_COUNT; t++) {
      if (availabilityProblem(course, t)) continue
      if (!evaluatePrerequisites(course, t, spans).satisfied) continue
      // Courses that depend on this one and start before it would finish are
      // broken by the move anyway, so their seats count as free.
      const end = t + course.durationTerms - 1
      const casualties = without.filter((p) => p.status === 'planned' && downstream.has(p.courseId) && p.term <= end)
      const load = new Array(TERM_COUNT).fill(0)
      for (const p of without) {
        if (casualties.includes(p)) continue
        const c = catalog.courses.get(p.courseId)
        if (c) for (const x of occupiedTerms(p.term, c.durationTerms)) load[x]++
      }
      if (occupiedTerms(t, course.durationTerms).some((x) => load[x] + 1 > catalog.school.load.max)) continue
      destination = t
      displaced = casualties
      break
    }

    if (destination === null) {
      changes.push({
        kind: 'remove',
        courseId: course.id,
        term: from,
        reason: 'Can no longer fit before graduation after this change.',
      })
      current = { placements: without }
      continue
    }
    changes.push({ kind: 'move', courseId: course.id, fromTerm: from, toTerm: destination })
    let placements: Placement[] = [...without, { courseId: course.id, term: destination, status: 'planned' }]
    // Displaced dependents go back in right after, where they fit; otherwise they drop.
    for (const d of displaced.sort((a, b) => a.term - b.term)) {
      placements = placements.filter((p) => p !== d)
      const dc = catalog.courses.get(d.courseId)!
      const spansNow = indexSpans(catalog, placements)
      const load = new Array(TERM_COUNT).fill(0)
      for (const p of placements) {
        const c = catalog.courses.get(p.courseId)
        if (c) for (const x of occupiedTerms(p.term, c.durationTerms)) load[x]++
      }
      let spot: TermIndex | null = null
      for (let t = Math.max(d.term + 1, student.startTerm); t < TERM_COUNT; t++) {
        if (availabilityProblem(dc, t) || !evaluatePrerequisites(dc, t, spansNow).satisfied) continue
        if (occupiedTerms(t, dc.durationTerms).some((x) => load[x] + 1 > catalog.school.load.max)) continue
        spot = t
        break
      }
      if (spot === null) {
        changes.push({
          kind: 'remove',
          courseId: dc.id,
          term: d.term,
          reason: 'Can no longer fit before graduation after this change.',
        })
      } else {
        changes.push({ kind: 'move', courseId: dc.id, fromTerm: d.term, toTerm: spot })
        placements.push({ courseId: dc.id, term: spot, status: 'planned' })
      }
    }
    current = { placements }
  }
  return finish(validatePlan(catalog, student, current, prefs))

  function finish(validation: ValidationReport): Cascade {
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
