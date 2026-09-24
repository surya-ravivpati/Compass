import { courseName, type Catalog } from './catalog.ts'
import { descendants } from './graph.ts'
import { diffPlans, previewEdit, type PlanDiff } from './edits.ts'
import { generatePlan, type PlacementReason } from './generate/index.ts'
import { evaluatePrerequisites, indexSpans, joinAnd } from './prereqs.ts'
import type { RequirementStatus } from './requirements.ts'
import { placementPhrase, yearOfTerm } from './terms.ts'
import { TERM_COUNT, type Placement, type Plan, type Preferences, type StudentState, type TermIndex } from './types.ts'
import { validatePlan, type CheckStatus, type Finding, type ValidationReport } from './validate.ts'
import { analyzeWorkload } from './workload.ts'

export type Scenario =
  | { kind: 'replace'; courseId: string; withCourseId: string }
  | { kind: 'move'; courseId: string; toTerm: TermIndex }
  | { kind: 'drop'; courseIds: string[] }
  | { kind: 'add'; courseId: string }
  | { kind: 'preferences'; preferences: Preferences }

export interface RequirementChange {
  requirementId: string
  name: string
  before: { status: RequirementStatus; covered: number }
  after: { status: RequirementStatus; covered: number }
  required: number
}

export interface PlanComparison {
  diff: PlanDiff
  /** Courses whose prerequisites are now met by a different course, or not at all. */
  prerequisiteEffects: { courseId: string; text: string }[]
  requirementChanges: RequirementChange[]
  /** Everything that changed besides the course the scenario named. */
  downstream: { courseId: string; text: string }[]
  workload: { term: TermIndex; before: number; after: number; beforeLabs: number; afterLabs: number }[]
  validity: { before: CheckStatus; after: CheckStatus }
}

export interface ScenarioResult {
  scenario: Scenario
  title: string
  status: 'valid' | 'no-valid-schedule'
  plan: Plan
  reasons: Record<string, PlacementReason[]>
  validation: ValidationReport
  comparison: PlanComparison
  problems: Finding[]
}

/**
 * Runs a what-if scenario against the student's current plan and reports
 * consequences side by side. It never ranks the options -- it shows what
 * changes, and the student decides.
 */
export function runScenario(
  catalog: Catalog,
  student: StudentState,
  preferences: Preferences,
  current: Plan,
  scenario: Scenario,
): ScenarioResult {
  const history = current.placements.filter((p) => p.status !== 'planned')
  const planned = current.placements.filter((p) => p.status === 'planned')
  const title = scenarioTitle(catalog, scenario)

  if (scenario.kind === 'move') {
    const from = planned.find((p) => p.courseId === scenario.courseId)
    if (!from) return failed(`${courseName(catalog, scenario.courseId)} isn't a planned course in your plan.`)
    const preview = previewEdit(
      catalog,
      student,
      current,
      { kind: 'move', courseId: scenario.courseId, fromTerm: from.term, toTerm: scenario.toTerm },
      preferences,
    )
    const plan = preview.cascade?.plan ?? preview.plan
    const validation = preview.cascade?.validation ?? preview.after
    return finish(plan, validation, {}, validation.graduationPathValid ? [] : errorsOf(validation))
  }

  let pins: Placement[] = []
  let exclude: string[] = []
  let require: string[] = []
  let prefs = preferences

  if (scenario.kind === 'replace') {
    const target = planned.find((p) => p.courseId === scenario.courseId)
    if (!target) return failed(`${courseName(catalog, scenario.courseId)} isn't a planned course in your plan.`)
    const course = catalog.courses.get(scenario.courseId)!
    // Re-plan what depends on the replaced course, and the rest of its
    // subject from that point on; keep everything else where it is.
    const downstream = descendants(catalog, scenario.courseId)
    pins = planned.filter((p) => {
      if (p.courseId === scenario.courseId) return false
      if (downstream.has(p.courseId)) return false
      const c = catalog.courses.get(p.courseId)!
      return !(c.department === course.department && p.term > target.term)
    })
    exclude = [scenario.courseId]
    require = [scenario.withCourseId]
  } else if (scenario.kind === 'drop') {
    const dropped = new Set(scenario.courseIds)
    const downstream = new Set(scenario.courseIds.flatMap((id) => [...descendants(catalog, id)]))
    pins = planned.filter((p) => !dropped.has(p.courseId) && !downstream.has(p.courseId) && isCoreLane(catalog, p.courseId))
    exclude = [...dropped]
  } else if (scenario.kind === 'add') {
    pins = planned.filter((p) => isCoreLane(catalog, p.courseId))
    require = [scenario.courseId]
  } else if (scenario.kind === 'preferences') {
    prefs = scenario.preferences
  }

  const result = generatePlan({ catalog, student, history, preferences: prefs, pins, exclude, require })
  return finish(result.plan, result.validation, result.reasons, result.problems, result.status)

  function finish(
    plan: Plan,
    validation: ValidationReport,
    reasons: Record<string, PlacementReason[]>,
    problems: Finding[],
    status: 'valid' | 'no-valid-schedule' = validation.graduationPathValid ? 'valid' : 'no-valid-schedule',
  ): ScenarioResult {
    return {
      scenario,
      title,
      status,
      plan,
      reasons,
      validation,
      comparison: comparePlans(catalog, student, preferences, current, plan, scenario),
      problems,
    }
  }

  function failed(message: string): ScenarioResult {
    const validation = validatePlan(catalog, student, current, preferences)
    const problem: Finding = { id: 'scenario-invalid', check: 'requirements', code: 'scenario-invalid', severity: 'error', message }
    return finish(current, validation, {}, [problem], 'no-valid-schedule')
  }
}

function errorsOf(validation: ValidationReport): Finding[] {
  return validation.findings.filter((f) => f.severity === 'error')
}

function isCoreLane(catalog: Catalog, courseId: string): boolean {
  const course = catalog.courses.get(courseId)
  if (!course) return false
  return course.satisfies.length > 0
}

export function scenarioTitle(catalog: Catalog, scenario: Scenario): string {
  const name = (id: string) => courseName(catalog, id)
  switch (scenario.kind) {
    case 'replace':
      return `${name(scenario.withCourseId)} instead of ${name(scenario.courseId)}`
    case 'move':
      return `${name(scenario.courseId)} in ${placementPhrase(scenario.toTerm, catalog.courses.get(scenario.courseId)?.durationTerms ?? 1)}`
    case 'drop':
      return `Without ${joinAnd(scenario.courseIds.map(name))}`
    case 'add':
      return `Adding ${name(scenario.courseId)}`
    case 'preferences':
      return 'With different priorities'
  }
}

/** Side-by-side consequences of two plans. No scores, no "better". */
export function comparePlans(
  catalog: Catalog,
  student: StudentState,
  preferences: Preferences,
  before: Plan,
  after: Plan,
  scenario?: Scenario,
): PlanComparison {
  const diff = diffPlans(before, after)
  const vBefore = validatePlan(catalog, student, before, preferences)
  const vAfter = validatePlan(catalog, student, after, preferences)

  const requirementChanges: RequirementChange[] = vBefore.progress.requirements.map((rb, i) => {
    const ra = vAfter.progress.requirements[i]!
    return {
      requirementId: rb.requirement.id,
      name: rb.requirement.name,
      required: rb.required,
      before: { status: rb.status, covered: rb.completed + rb.inProgress + rb.planned },
      after: { status: ra.status, covered: ra.completed + ra.inProgress + ra.planned },
    }
  }).filter((c) => c.before.status !== c.after.status || c.before.covered !== c.after.covered)

  // Which prerequisite satisfies each course, before and after.
  const satisfiers = (plan: Plan) => {
    const spans = indexSpans(catalog, plan.placements)
    const map = new Map<string, string[]>()
    for (const p of plan.placements) {
      if (p.status !== 'planned') continue
      const course = catalog.courses.get(p.courseId)
      if (!course || course.prerequisites.length === 0) continue
      const result = evaluatePrerequisites(course, p.term, spans)
      map.set(p.courseId, result.groups.map((g) => g.match?.span.courseId ?? '∅'))
    }
    return map
  }
  const sb = satisfiers(before)
  const sa = satisfiers(after)
  const prerequisiteEffects: PlanComparison['prerequisiteEffects'] = []
  for (const [id, afterSat] of sa) {
    const beforeSat = sb.get(id)
    if (!beforeSat) continue
    afterSat.forEach((sat, i) => {
      const was = beforeSat[i]
      if (was === sat) return
      const name = courseName(catalog, id)
      if (sat === '∅') {
        prerequisiteEffects.push({ courseId: id, text: `${name} would lose its prerequisite (${courseName(catalog, was ?? '')}).` })
      } else if (was && was !== '∅') {
        prerequisiteEffects.push({
          courseId: id,
          text: `${name} would rely on ${courseName(catalog, sat)} instead of ${courseName(catalog, was)}.`,
        })
      }
    })
  }
  for (const p of diff.added) {
    const course = catalog.courses.get(p.courseId)
    if (!course || course.prerequisites.length === 0) continue
    const afterSat = sa.get(p.courseId)
    if (!afterSat) continue
    const names = afterSat.filter((s) => s !== '∅').map((s) => courseName(catalog, s))
    if (names.length) {
      prerequisiteEffects.push({ courseId: p.courseId, text: `${course.name} would build on ${joinAnd(names)}.` })
    }
  }

  const named = new Set<string>()
  if (scenario?.kind === 'replace') {
    named.add(scenario.courseId)
    named.add(scenario.withCourseId)
  } else if (scenario?.kind === 'move' || scenario?.kind === 'add') {
    named.add(scenario.courseId)
  } else if (scenario?.kind === 'drop') {
    for (const id of scenario.courseIds) named.add(id)
  }
  const downstream: PlanComparison['downstream'] = []
  const dur = (id: string) => catalog.courses.get(id)?.durationTerms ?? 1
  for (const m of diff.moved) {
    if (named.has(m.courseId)) continue
    const direction = yearOfTerm(m.toTerm) > yearOfTerm(m.fromTerm) || m.toTerm > m.fromTerm ? 'later' : 'earlier'
    downstream.push({
      courseId: m.courseId,
      text: `${courseName(catalog, m.courseId)} moves ${direction}, from ${placementPhrase(m.fromTerm, dur(m.courseId))} to ${placementPhrase(m.toTerm, dur(m.courseId))}.`,
    })
  }
  for (const p of diff.removed) {
    if (named.has(p.courseId)) continue
    downstream.push({ courseId: p.courseId, text: `${courseName(catalog, p.courseId)} leaves the plan (${placementPhrase(p.term, dur(p.courseId))}).` })
  }
  for (const p of diff.added) {
    if (named.has(p.courseId)) continue
    downstream.push({ courseId: p.courseId, text: `${courseName(catalog, p.courseId)} joins the plan (${placementPhrase(p.term, dur(p.courseId))}).` })
  }

  const wb = analyzeWorkload(catalog, before, preferences).terms
  const wa = analyzeWorkload(catalog, after, preferences).terms
  const workload: PlanComparison['workload'] = []
  for (let t = student.startTerm; t < TERM_COUNT; t++) {
    workload.push({
      term: t,
      before: wb[t]!.intensity,
      after: wa[t]!.intensity,
      beforeLabs: wb[t]!.labs.length,
      afterLabs: wa[t]!.labs.length,
    })
  }

  return {
    diff,
    prerequisiteEffects,
    requirementChanges,
    downstream,
    workload,
    validity: { before: vBefore.status, after: vAfter.status },
  }
}
