import type { Catalog } from './catalog.ts'
import { descendants } from './graph.ts'
import { evaluatePrerequisites, indexSpans, joinOr } from './prereqs.ts'
import { availabilityProblem, gradeList, occupiedTerms, termLabel } from './terms.ts'
import { TERM_COUNT, type Course, type Placement, type Plan, type StudentState, type TermIndex } from './types.ts'

export interface TermOption {
  term: TermIndex
  ok: boolean
  /** Short reason when not ok: "Spring only", "Needs Chemistry first". */
  reason?: string
  /**
   * The term is already at the school's maximum load. Allowed -- the edit
   * preview proposes which elective to move or drop -- but never silent.
   */
  crowded?: boolean
  /** Planned courses that would lose a prerequisite if the course went here. */
  breaks: string[]
}

/**
 * Where a course could go instead, term by term, judged by the same rules
 * the validator uses. Used for drag-and-drop hints and the Move menu.
 */
export function moveOptions(catalog: Catalog, student: StudentState, plan: Plan, placement: Placement): TermOption[] {
  const course = catalog.courses.get(placement.courseId)!
  const others = plan.placements.filter((p) => p !== placement && !(p.courseId === placement.courseId && p.term === placement.term))
  const out: TermOption[] = []
  for (let t = Math.max(0, student.startTerm); t < TERM_COUNT; t++) {
    if (course.durationTerms === 2 && t % 2 === 1) continue
    if (t === placement.term) continue
    out.push(judge(catalog, others, course, t, { dependentsOf: placement }))
  }
  return out
}

/** Whether `course` could be added at `term` on top of `plan`. */
export function addOption(catalog: Catalog, student: StudentState, plan: Plan, course: Course, term: TermIndex): TermOption {
  if (term < student.startTerm) return { term, ok: false, reason: 'Already passed', breaks: [] }
  const taken = plan.placements.filter((p) => p.courseId === course.id).length
  if (taken >= (course.maxEnrollments ?? 1)) return { term, ok: false, reason: 'Already in your plan', breaks: [] }
  if (course.equivalenceGroup) {
    const twin = plan.placements.find((p) => p.courseId !== course.id && catalog.courses.get(p.courseId)?.equivalenceGroup === course.equivalenceGroup)
    if (twin) return { term, ok: false, reason: `Repeats ${catalog.courses.get(twin.courseId)!.name}`, breaks: [] }
  }
  return judge(catalog, plan.placements, course, term, {})
}

/** Courses that could take this placement's slot: equivalents first, then its department. */
export function replacementOptions(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  placement: Placement,
): { course: Course; option: TermOption }[] {
  const current = catalog.courses.get(placement.courseId)!
  const others: Plan = {
    placements: plan.placements.filter((p) => !(p.courseId === placement.courseId && p.term === placement.term)),
  }
  const inPlan = new Set(others.placements.map((p) => p.courseId))
  const candidates = [...catalog.courses.values()].filter(
    (c) =>
      c.id !== current.id &&
      !inPlan.has(c.id) &&
      c.durationTerms === current.durationTerms &&
      (c.department === current.department || (current.equivalenceGroup && c.equivalenceGroup === current.equivalenceGroup)),
  )
  return candidates
    .map((course) => ({ course, option: addOption(catalog, student, others, course, placement.term) }))
    .filter((x) => x.option.ok)
    .sort((a, b) => {
      const eq = (c: Course) => (current.equivalenceGroup && c.equivalenceGroup === current.equivalenceGroup ? 0 : 1)
      return eq(a.course) - eq(b.course) || a.course.name.localeCompare(b.course.name)
    })
}

function judge(
  catalog: Catalog,
  others: Placement[],
  course: Course,
  term: TermIndex,
  opts: { dependentsOf?: Placement },
): TermOption {
  const problem = availabilityProblem(course, term)
  if (problem) {
    const reason =
      problem.kind === 'season'
        ? course.durationTerms === 2
          ? 'Starts in fall'
          : `${course.seasons[0] === 'fall' ? 'Fall' : 'Spring'} only`
        : problem.kind === 'grade'
          ? `${capitalize(gradeList(course.grades))} only`
          : 'Doesn’t fit'
    return { term, ok: false, reason, breaks: [] }
  }
  const spans = indexSpans(catalog, others)
  const result = evaluatePrerequisites(course, term, spans)
  const missing = result.groups.find((g) => !g.match)
  if (missing) {
    const names = missing.group.anyOf.map((o) => catalog.courses.get(o.courseId)?.name ?? o.courseId)
    return { term, ok: false, reason: `Needs ${joinOr(names.slice(0, 2))} first`, breaks: [] }
  }
  // Seats held by this course's own dependents that the move would push out
  // anyway count as free: the cascade proposal moves those courses later.
  const downstream = opts.dependentsOf ? descendants(catalog, course.id) : new Set<string>()
  const end = term + course.durationTerms - 1
  const load = new Array(TERM_COUNT).fill(0)
  for (const p of others) {
    const c = catalog.courses.get(p.courseId)
    if (!c || p.term < 0) continue
    if (p.status === 'planned' && downstream.has(p.courseId) && p.term <= end) continue
    for (const t of occupiedTerms(p.term, c.durationTerms)) load[t]++
  }
  const full = occupiedTerms(term, course.durationTerms).find((t) => load[t] + 1 > catalog.school.load.max)

  const breaks: string[] = []
  if (opts.dependentsOf) {
    const moved = [...others, { ...opts.dependentsOf, term }]
    const movedSpans = indexSpans(catalog, moved)
    for (const p of others) {
      if (p.status !== 'planned') continue
      const dependent = catalog.courses.get(p.courseId)
      if (!dependent?.prerequisites.some((g) => g.anyOf.some((o) => o.courseId === course.id))) continue
      if (!evaluatePrerequisites(dependent, p.term, movedSpans).satisfied) breaks.push(dependent.name)
    }
  }
  if (full !== undefined) return { term, ok: true, crowded: true, reason: `${termLabel(full)} is full`, breaks }
  return { term, ok: true, breaks }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
