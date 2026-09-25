import { courseName, type Catalog } from './catalog.ts'
import { earliestStarts, limitingChain } from './graph.ts'
import { evaluatePrerequisites, indexSpans, joinOr, type GroupResult, type SpanIndex } from './prereqs.ts'
import { allocateRequirements, type ProgressReport } from './requirements.ts'
import {
  atPhrase,
  availabilityProblem,
  endTerm,
  occupiedTerms,
  placementPhrase,
  termLabel,
  yearOfTerm,
  yearPhrase,
} from './terms.ts'
import {
  BEFORE_HIGH_SCHOOL,
  TERM_COUNT,
  type Course,
  type Placement,
  type Plan,
  type Preferences,
  type SourceRef,
  type StudentState,
  type TermIndex,
} from './types.ts'

export type CheckId =
  | 'requirements'
  | 'prerequisites'
  | 'availability'
  | 'reachability'
  | 'load'
  | 'repeats'
  | 'policies'

export type Severity = 'error' | 'warning' | 'info'
export type CheckStatus = 'valid' | 'attention' | 'invalid'

/** A possible adjustment. Compass shows these; the student chooses. */
export type Fix =
  | { kind: 'move'; courseId: string; fromTerm: TermIndex; toTerm: TermIndex; label: string }
  | { kind: 'remove'; courseId: string; term: TermIndex; label: string }
  | { kind: 'add'; courseId: string; term: TermIndex; label: string }

export interface Finding {
  /** Stable key for UI lists and diffs. */
  id: string
  check: CheckId
  code: string
  severity: Severity
  /** Plain English a fifteen-year-old can act on. */
  message: string
  courseId?: string
  term?: TermIndex
  relatedCourseIds?: string[]
  requirementId?: string
  policyId?: string
  source?: SourceRef
  fixes?: Fix[]
}

export interface CheckResult {
  id: CheckId
  label: string
  status: CheckStatus
  findings: Finding[]
}

export interface TermLoad {
  term: TermIndex
  count: number
  courseIds: string[]
}

export interface ValidationReport {
  /** `invalid` when any hard constraint fails; `attention` for targets missed. */
  status: CheckStatus
  /** True when no hard constraint fails: the plan graduates the student. */
  graduationPathValid: boolean
  checks: CheckResult[]
  findings: Finding[]
  progress: ProgressReport
  load: TermLoad[]
}

export const CHECK_LABELS: Record<CheckId, string> = {
  requirements: 'Requirements',
  prerequisites: 'Prerequisites',
  availability: 'Course availability',
  reachability: 'Future reachability',
  load: 'Course load',
  repeats: 'No repeated courses',
  policies: 'School policies',
}

const CHECK_ORDER: CheckId[] = ['requirements', 'prerequisites', 'availability', 'reachability', 'load', 'repeats', 'policies']

/**
 * Validates a whole plan against the school configuration. Pure and fast
 * enough to run after every drag: the planner calls it on each change.
 */
export function validatePlan(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  preferences?: Pick<Preferences, 'targetCourses'>,
): ValidationReport {
  const findings: Finding[] = []
  const add = (f: Omit<Finding, 'id'>) => {
    findings.push({ ...f, id: [f.code, f.courseId ?? '', f.term ?? '', f.requirementId ?? '', f.policyId ?? ''].join(':') })
  }

  const known = plan.placements.filter((p) => {
    if (catalog.courses.has(p.courseId)) return true
    add({
      check: 'availability',
      code: 'unknown-course',
      severity: 'error',
      message: `"${p.courseId}" is not in your school's course catalog.`,
      courseId: p.courseId,
      term: p.term,
    })
    return false
  })
  const spans = indexSpans(catalog, known)
  const future = known.filter((p) => p.status !== 'completed')

  checkTiming(catalog, student, known, add)
  checkAvailability(catalog, future, add)
  checkPrerequisites(catalog, student, future, spans, add)
  checkRepeats(catalog, known, add)
  const load = checkLoad(catalog, student, known, add)
  checkPolicies(catalog, student, known, spans, load, add)
  const progress = allocateRequirements(catalog, known)
  checkRequirements(catalog, student, known, spans, progress, load, add)
  checkReachability(catalog, student, known, progress, preferences?.targetCourses ?? [], add)

  const checks = CHECK_ORDER.map((id): CheckResult => {
    const own = findings.filter((f) => f.check === id)
    return { id, label: CHECK_LABELS[id], status: statusOf(own), findings: own }
  })
  return {
    status: statusOf(findings),
    graduationPathValid: !findings.some((f) => f.severity === 'error'),
    checks,
    findings,
    progress,
    load,
  }
}

function statusOf(findings: Finding[]): CheckStatus {
  if (findings.some((f) => f.severity === 'error')) return 'invalid'
  if (findings.some((f) => f.severity === 'warning')) return 'attention'
  return 'valid'
}

type Add = (f: Omit<Finding, 'id'>) => void

function checkTiming(catalog: Catalog, student: StudentState, placements: Placement[], add: Add) {
  for (const p of placements) {
    const name = courseName(catalog, p.courseId)
    if (p.status === 'planned' && p.term < student.startTerm) {
      add({
        check: 'availability',
        code: 'planned-in-past',
        severity: 'error',
        message: `${name} is planned for ${termLabel(p.term)}, which has already passed.`,
        courseId: p.courseId,
        term: p.term,
      })
    }
    if (p.status === 'completed' && p.term >= student.startTerm) {
      add({
        check: 'availability',
        code: 'completed-in-future',
        severity: 'error',
        message: `${name} is marked completed in ${termLabel(p.term)}, which hasn't happened yet.`,
        courseId: p.courseId,
        term: p.term,
      })
    }
  }
}

function checkAvailability(catalog: Catalog, placements: Placement[], add: Add) {
  for (const p of placements) {
    const course = catalog.courses.get(p.courseId)!
    const problem = availabilityProblem(course, p.term)
    if (!problem) continue
    const fixes: Fix[] = []
    const alternative = nearestAvailableTerm(course, p.term)
    if (alternative !== null) {
      fixes.push({
        kind: 'move',
        courseId: course.id,
        fromTerm: p.term,
        toTerm: alternative,
        label: `Move ${course.name} to ${placementPhrase(alternative, course.durationTerms)}`,
      })
    }
    add({
      check: 'availability',
      code: `availability-${problem.kind}`,
      severity: 'error',
      message: problem.message,
      courseId: course.id,
      term: p.term,
      source: course.source,
      fixes,
    })
  }
}

function nearestAvailableTerm(course: Course, from: TermIndex): TermIndex | null {
  for (let d = 1; d < TERM_COUNT; d++) {
    for (const t of [from + d, from - d]) {
      if (t >= 0 && t < TERM_COUNT && !availabilityProblem(course, t)) return t
    }
  }
  return null
}

function checkPrerequisites(catalog: Catalog, student: StudentState, placements: Placement[], spans: SpanIndex, add: Add) {
  for (const p of placements) {
    const course = catalog.courses.get(p.courseId)!
    const result = evaluatePrerequisites(course, p.term, spans)
    for (const group of result.groups) {
      if (group.match) continue
      add({
        check: 'prerequisites',
        code: 'prerequisite-missing',
        severity: 'error',
        message: prerequisiteMessage(catalog, course, p.term, group, spans),
        courseId: course.id,
        term: p.term,
        relatedCourseIds: group.group.anyOf.map((o) => o.courseId),
        source: course.source,
        fixes: prerequisiteFixes(catalog, student, course, p.term, group, spans),
      })
    }
  }
}

/**
 * "AP Calculus BC needs AP Precalculus first, but your plan has AP
 * Precalculus in Senior Fall, the same term."
 */
export function prerequisiteMessage(
  catalog: Catalog,
  course: Course,
  term: TermIndex,
  group: GroupResult,
  spans: SpanIndex,
): string {
  const options = group.group.anyOf
  const allConcurrent = options.every((o) => o.timing === 'concurrent')
  const anyConcurrent = options.some((o) => o.timing !== 'before')
  const names = joinOr(options.map((o) => courseName(catalog, o.courseId)))
  const needs = allConcurrent
    ? `${course.name} has to be taken at the same time as ${names}`
    : anyConcurrent
      ? `${course.name} needs ${names} before it or at the same time`
      : `${course.name} needs ${names} first`

  const placed = options
    .flatMap((o) => (spans.get(o.courseId) ?? []).map((s) => ({ o, s })))
    .sort((a, b) => a.s.start - b.s.start)[0]
  if (!placed) {
    const neither = options.length === 1 ? 'it is not' : options.length === 2 ? 'neither is' : 'none of them is'
    return `${needs}, and ${neither} in your plan.`
  }
  const where = atPhrase(placed.s.start, catalog.courses.get(placed.o.courseId)!.durationTerms)
  const relation =
    placed.s.start === term
      ? 'the same term'
      : placed.s.start > term
        ? `after ${course.name}`
        : allConcurrent
          ? `not at the same time`
          : 'before it finishes'
  return `${needs}, but your plan has ${courseName(catalog, placed.o.courseId)} ${where}, ${relation}.`
}

function prerequisiteFixes(
  catalog: Catalog,
  student: StudentState,
  course: Course,
  term: TermIndex,
  group: GroupResult,
  spans: SpanIndex,
): Fix[] {
  const fixes: Fix[] = []
  // Option 1: move this course later, to the first term that works.
  for (let t = term + 1; t < TERM_COUNT; t++) {
    if (availabilityProblem(course, t)) continue
    if (evaluatePrerequisites(course, t, spans).satisfied) {
      fixes.push({
        kind: 'move',
        courseId: course.id,
        fromTerm: term,
        toTerm: t,
        label: `Move ${course.name} to ${placementPhrase(t, course.durationTerms)}`,
      })
      break
    }
  }
  // Option 2: move a planned prerequisite earlier.
  for (const option of group.group.anyOf) {
    const pre = catalog.courses.get(option.courseId)!
    for (const span of spans.get(option.courseId) ?? []) {
      if (span.status !== 'planned') continue
      for (let t = student.startTerm; t < span.start; t++) {
        if (availabilityProblem(pre, t)) continue
        const end = endTerm(t, pre.durationTerms)
        const courseEnd = endTerm(term, course.durationTerms)
        const fits =
          option.timing === 'before' ? end < term : option.timing === 'concurrent' ? t <= courseEnd && end >= term : t <= courseEnd
        if (!fits || !evaluatePrerequisites(pre, t, spans).satisfied) continue
        fixes.push({
          kind: 'move',
          courseId: pre.id,
          fromTerm: span.start,
          toTerm: t,
          label: `Move ${pre.name} to ${placementPhrase(t, pre.durationTerms)}`,
        })
        break
      }
    }
  }
  return fixes.slice(0, 3)
}

function checkRepeats(catalog: Catalog, placements: Placement[], add: Add) {
  const ordered = [...placements].sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId))
  const counts = new Map<string, number>()
  const groupFirst = new Map<string, Placement>()
  ordered.forEach((p, i) => {
    const course = catalog.courses.get(p.courseId)!
    const n = (counts.get(p.courseId) ?? 0) + 1
    counts.set(p.courseId, n)
    const max = course.maxEnrollments ?? 1
    const alongside = ordered
      .slice(0, i)
      .find((q) => q.courseId === p.courseId && q.term !== BEFORE_HIGH_SCHOOL && p.term <= endTerm(q.term, course.durationTerms))
    if (n > max && p.status !== 'completed') {
      const earlier = ordered.find((q) => q.courseId === p.courseId && q !== p)!
      add({
        check: 'repeats',
        code: 'repeat-course',
        severity: 'error',
        message:
          max === 1
            ? `${course.name} is in your plan twice. You ${earlier.status === 'completed' ? 'already completed it' : 'already have it'} ${atPhrase(earlier.term, course.durationTerms)}.`
            : `${course.name} can be taken ${max} times, and your plan has it ${n} times.`,
        courseId: course.id,
        term: p.term,
        fixes: [{ kind: 'remove', courseId: course.id, term: p.term, label: `Remove this ${course.name}` }],
      })
    } else if (alongside && p.status !== 'completed') {
      add({
        check: 'repeats',
        code: 'repeat-same-term',
        severity: 'error',
        message: `${course.name} is in your plan twice ${atPhrase(p.term, course.durationTerms)}. You can take it again later, but not twice at the same time.`,
        courseId: course.id,
        term: p.term,
        fixes: [{ kind: 'remove', courseId: course.id, term: p.term, label: `Remove this ${course.name}` }],
      })
    }
    if (course.equivalenceGroup) {
      const first = groupFirst.get(course.equivalenceGroup)
      if (first && first.courseId !== course.id && p.status !== 'completed') {
        const firstCourse = catalog.courses.get(first.courseId)!
        add({
          check: 'repeats',
          code: 'repeat-equivalent',
          severity: 'error',
          message: `${course.name} covers the same material as ${firstCourse.name}, which you ${first.status === 'completed' ? 'already completed' : 'already have'} ${atPhrase(first.term, firstCourse.durationTerms)}.`,
          courseId: course.id,
          term: p.term,
          relatedCourseIds: [first.courseId],
          fixes: [{ kind: 'remove', courseId: course.id, term: p.term, label: `Remove ${course.name}` }],
        })
      } else if (!first) {
        groupFirst.set(course.equivalenceGroup, p)
      }
    }
  })
}

function checkLoad(catalog: Catalog, student: StudentState, placements: Placement[], add: Add): TermLoad[] {
  const { min, max } = catalog.school.load
  const load: TermLoad[] = []
  for (let term = 0; term < TERM_COUNT; term++) {
    const courseIds = placements
      .filter((p) => p.term !== BEFORE_HIGH_SCHOOL && occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(term))
      .map((p) => p.courseId)
      .sort()
    load.push({ term, count: courseIds.length, courseIds })
    if (term < student.startTerm) continue
    if (courseIds.length > max) {
      add({
        check: 'load',
        code: 'load-over',
        severity: 'error',
        message: `${termLabel(term)} has ${courseIds.length} courses. Your school allows at most ${max} a semester.`,
        term,
        source: catalog.school.source,
      })
    } else if (courseIds.length < min) {
      add({
        check: 'load',
        code: 'load-under',
        severity: 'warning',
        message: `${termLabel(term)} has ${courseIds.length} course${courseIds.length === 1 ? '' : 's'}. Your school's usual load is ${min}–${max} a semester.`,
        term,
        source: catalog.school.source,
      })
    }
  }
  return load
}

function checkPolicies(
  catalog: Catalog,
  student: StudentState,
  placements: Placement[],
  spans: SpanIndex,
  load: TermLoad[],
  add: Add,
) {
  for (const policy of catalog.school.policies) {
    if (policy.kind === 'every-term') {
      const department = catalog.departments.get(policy.department)
      const dept = department?.shortName ?? department?.name.toLowerCase() ?? policy.department
      for (let term = student.startTerm; term < TERM_COUNT; term++) {
        const has = load[term]!.courseIds.some((id) => catalog.courses.get(id)!.department === policy.department || !!policy.alsoCounts?.includes(id))
        if (has) continue
        const candidates = openCoursesAt(catalog, policy.department, term, placements, spans)
        const severity = candidates.length === 0 ? 'info' : policy.enforcement === 'required' ? 'error' : 'warning'
        add({
          check: 'policies',
          code: 'every-term-gap',
          severity,
          message:
            candidates.length === 0
              ? `${termLabel(term)} has no ${dept} course. That's expected: none of your school's ${dept} courses are open to you then, given what you've taken and planned.`
              : `${termLabel(term)} has no ${dept} course. ${policy.label}.`,
          term,
          policyId: policy.id,
          source: policy.source,
          fixes: candidates.slice(0, 3).map((c) => ({
            kind: 'add' as const,
            courseId: c.id,
            term: c.durationTerms === 2 && term % 2 === 1 ? term - 1 : term,
            label: `Add ${c.name}`,
          })),
        })
      }
    }
    if (policy.kind === 'placement') {
      const targetYear = policy.grade - 9
      const matches = placements.filter((p) => policy.courseIds.includes(p.courseId))
      if (matches.some((p) => p.status === 'completed')) continue
      for (const p of matches) {
        if (p.status !== 'planned' || p.term === BEFORE_HIGH_SCHOOL) continue
        if (yearOfTerm(p.term) === targetYear) continue
        if (student.startTerm > targetYear * 2 + 1) continue // the target year is already past
        const course = catalog.courses.get(p.courseId)!
        add({
          check: 'policies',
          code: 'placement-off-target',
          severity: policy.enforcement === 'required' ? 'error' : 'warning',
          message: `${course.name} is in ${yearPhrase(p.term)}. ${policy.label}.`,
          courseId: course.id,
          term: p.term,
          policyId: policy.id,
          source: policy.source,
        })
      }
    }
    if (policy.kind === 'sequence-continuity') {
      for (const [sequenceId, ids] of catalog.sequences) {
        const steps = placements
          .filter((p) => ids.includes(p.courseId))
          .map((p) => ({ p, course: catalog.courses.get(p.courseId)! }))
          .sort((a, b) => a.course.sequence!.step - b.course.sequence!.step || a.p.term - b.p.term)
        for (let i = 1; i < steps.length; i++) {
          const prev = steps[i - 1]!
          const next = steps[i]!
          if (next.p.status !== 'planned' || next.course.sequence!.step === prev.course.sequence!.step) continue
          const gap = next.p.term - endTerm(prev.p.term, prev.course.durationTerms) - 1
          if (gap < 2) continue
          add({
            check: 'policies',
            code: 'sequence-gap',
            severity: policy.enforcement === 'required' ? 'error' : 'warning',
            message: `There's a gap between ${prev.course.name} and ${next.course.name}. ${policy.label}.`,
            courseId: next.course.id,
            term: next.p.term,
            relatedCourseIds: [prev.course.id],
            policyId: `${policy.id}:${sequenceId}`,
            source: policy.source,
          })
        }
      }
    }
  }
}

/** Courses in a department a student could add at `term` without breaking a rule. */
export function openCoursesAt(
  catalog: Catalog,
  department: string,
  term: TermIndex,
  placements: Placement[],
  spans: SpanIndex,
): Course[] {
  const takenGroups = new Set(
    placements.map((p) => catalog.courses.get(p.courseId)?.equivalenceGroup).filter((g): g is string => !!g),
  )
  const counts = new Map<string, number>()
  for (const p of placements) counts.set(p.courseId, (counts.get(p.courseId) ?? 0) + 1)
  return [...catalog.courses.values()]
    .filter((c) => c.department === department)
    .filter((c) => (counts.get(c.id) ?? 0) < (c.maxEnrollments ?? 1))
    .filter((c) => !c.equivalenceGroup || !takenGroups.has(c.equivalenceGroup))
    .filter((c) => {
      const start = c.durationTerms === 2 && term % 2 === 1 ? term - 1 : term
      return !availabilityProblem(c, start) && evaluatePrerequisites(c, start, spans).satisfied
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function checkRequirements(
  catalog: Catalog,
  student: StudentState,
  placements: Placement[],
  spans: SpanIndex,
  progress: ProgressReport,
  load: TermLoad[],
  add: Add,
) {
  for (const r of progress.requirements) {
    if (r.status !== 'missing') continue
    const req = r.requirement
    for (const m of r.mustInclude) {
      if (m.satisfiedBy) continue
      add({
        check: 'requirements',
        code: 'requirement-course-missing',
        severity: 'error',
        message: `${req.name} requires ${joinOr(m.group.anyOf.map((id) => courseName(catalog, id)))}, and your plan doesn't include ${m.group.anyOf.length === 1 ? 'it' : 'one'}.`,
        requirementId: req.id,
        relatedCourseIds: m.group.anyOf,
        source: req.source,
        fixes: suggestAdds(catalog, student, placements, spans, load, m.group.anyOf),
      })
    }
    if (r.remaining > 0) {
      const eligible = [...catalog.courses.values()].filter((c) => c.satisfies.includes(req.id)).map((c) => c.id)
      add({
        check: 'requirements',
        code: 'requirement-credits-short',
        severity: 'error',
        message: `Your plan is ${formatCredits(r.remaining)} short in ${req.name}: it needs ${formatCredits(req.credits)}, and the plan covers ${formatCredits(r.completed + r.inProgress + r.planned)}.`,
        requirementId: req.id,
        source: req.source,
        fixes: suggestAdds(catalog, student, placements, spans, load, eligible),
      })
    }
  }
  const total = progress.total
  if (total.remaining > 0) {
    add({
      check: 'requirements',
      code: 'total-credits-short',
      severity: 'error',
      message: `Your plan earns ${formatCredits(total.completed + total.inProgress + total.planned)} in total. Graduation needs ${formatCredits(total.required)}.`,
      source: catalog.school.source,
    })
  }
}

function suggestAdds(
  catalog: Catalog,
  student: StudentState,
  placements: Placement[],
  spans: SpanIndex,
  load: TermLoad[],
  courseIds: string[],
): Fix[] {
  const fixes: Fix[] = []
  const inPlan = new Set(placements.map((p) => p.courseId))
  for (const id of [...courseIds].sort()) {
    if (inPlan.has(id)) continue
    const course = catalog.courses.get(id)
    if (!course) continue
    for (let t = student.startTerm; t < TERM_COUNT; t++) {
      if (availabilityProblem(course, t)) continue
      const fits = occupiedTerms(t, course.durationTerms).every((x) => load[x]!.count < catalog.school.load.max)
      if (!fits || !evaluatePrerequisites(course, t, spans).satisfied) continue
      fixes.push({ kind: 'add', courseId: id, term: t, label: `Add ${course.name} in ${placementPhrase(t, course.durationTerms)}` })
      break
    }
    if (fixes.length >= 3) break
  }
  return fixes
}

function checkReachability(
  catalog: Catalog,
  student: StudentState,
  placements: Placement[],
  progress: ProgressReport,
  targetCourses: string[],
  add: Add,
) {
  const history = placements.filter((p) => p.status !== 'planned')
  const earliest = earliestStarts(catalog, history, student.startTerm)
  const takenIds = new Set(history.map((p) => p.courseId))

  for (const r of progress.requirements) {
    if (r.status !== 'missing') continue
    const req = r.requirement
    for (const m of r.mustInclude) {
      if (m.satisfiedBy) continue
      const reachable = m.group.anyOf.some((id) => earliest.get(id)?.term != null)
      if (reachable) continue
      const first = m.group.anyOf[0]!
      const chain = limitingChain(catalog, earliest, first)
      add({
        check: 'reachability',
        code: 'requirement-unreachable',
        severity: 'error',
        message: `${req.name} can no longer be finished before graduation: ${joinOr(m.group.anyOf.map((id) => courseName(catalog, id)))} won't fit in the terms you have left${chain.length > 1 ? ` (it needs ${courseName(catalog, chain[1]!)} first)` : ''}.`,
        requirementId: req.id,
        relatedCourseIds: m.group.anyOf,
        source: req.source,
      })
    }
    // Credits that remain reachable from the courses not yet taken. Any course
    // can count as an elective, so there the limit is the seats left.
    const reachableCredits =
      req.kind === 'elective'
        ? seatCredits(catalog, student)
        : [...catalog.courses.values()]
            .filter((c) => c.satisfies.includes(req.id) && !takenIds.has(c.id) && earliest.get(c.id)?.term != null)
            .reduce((sum, c) => sum + c.credits, 0)
    const stillNeeded = req.credits - r.completed - r.inProgress
    if (stillNeeded > 0 && reachableCredits < stillNeeded) {
      add({
        check: 'reachability',
        code: 'requirement-credits-unreachable',
        severity: 'error',
        message:
          req.kind === 'elective'
            ? `${req.name} can no longer be finished before graduation: you need ${formatCredits(stillNeeded)} more, and at most ${formatCredits(reachableCredits)} fit in the semesters you have left.`
            : `${req.name} can no longer be finished before graduation: you need ${formatCredits(stillNeeded)} more, and only ${formatCredits(reachableCredits)} of ${req.name.toLowerCase()} courses are still reachable.`,
        requirementId: req.id,
        source: req.source,
      })
    }
  }

  // Total credits: at most one half-credit per open seat per semester remains.
  const total = progress.total
  const doneCredits = total.completed + total.inProgress
  const seats = seatCredits(catalog, student)
  if (total.remaining > 0 && doneCredits + seats < total.required) {
    add({
      check: 'reachability',
      code: 'total-credits-unreachable',
      severity: 'error',
      message: `Graduation needs ${formatCredits(total.required)}. You have ${formatCredits(doneCredits)}, and at most ${formatCredits(seats)} more fit in the semesters you have left.`,
      source: catalog.school.source,
    })
  }

  const inPlan = new Set(placements.map((p) => p.courseId))
  for (const id of targetCourses) {
    if (inPlan.has(id) || !catalog.courses.has(id)) continue
    const info = earliest.get(id)
    const course = catalog.courses.get(id)!
    if (info?.term == null) {
      const chain = limitingChain(catalog, earliest, id)
      add({
        check: 'reachability',
        code: 'target-unreachable',
        severity: 'warning',
        message: `${course.name} can't fit before graduation${chain.length > 1 ? `: it needs ${chain.slice(1).map((c) => courseName(catalog, c)).join(', then ')} first, and there aren't enough terms left` : ''}.`,
        courseId: id,
        relatedCourseIds: chain.slice(1),
        source: course.source,
      })
    } else {
      add({
        check: 'reachability',
        code: 'target-not-planned',
        severity: 'info',
        message: `${course.name} is reachable (as early as ${placementPhrase(info.term, course.durationTerms)}) but isn't in your plan yet.`,
        courseId: id,
        term: info.term,
        source: course.source,
      })
    }
  }
}

/** The most credit still earnable: every open seat, every remaining semester, at a half credit each. */
function seatCredits(catalog: Catalog, student: StudentState): number {
  const terms = Math.max(0, TERM_COUNT - student.startTerm)
  return terms * catalog.school.load.max * 0.5
}

export function formatCredits(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return `${rounded} credit${rounded === 1 ? '' : 's'}`
}
