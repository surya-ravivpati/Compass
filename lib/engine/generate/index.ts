import type { Catalog } from '../catalog.ts'
import { earliestStarts, prerequisiteDepths } from '../graph.ts'
import { allocateRequirements } from '../requirements.ts'
import { availabilityProblem } from '../terms.ts'
import {
  TERM_COUNT,
  type Placement,
  type Plan,
  type Preferences,
  type StudentState,
} from '../types.ts'
import { validatePlan, type Finding, type ValidationReport } from '../validate.ts'
import { PlanningContext } from './context.ts'
import { fillElectives } from './fill.ts'
import { buildLanes, enumerateTracks, reasonKey, type Lane, type PlacementReason, type Track } from './lanes.ts'
import { buildPreferenceModel, GOAL_LABELS } from './preferences.ts'

export type { PlacementReason } from './lanes.ts'
export { buildPreferenceModel, GOAL_LABELS, GOAL_TAGS, levelIndex } from './preferences.ts'

export interface GenerateInput {
  catalog: Catalog
  student: StudentState
  /** Completed and in-progress courses. Never moved. */
  history: Placement[]
  preferences: Preferences
  /** Planned placements the student has locked. Kept exactly where they are. */
  pins?: Placement[]
  /** Courses the plan must not include. */
  exclude?: string[]
  /** Courses the plan must include. */
  require?: string[]
}

export type StageId = 'requirements' | 'prerequisites' | 'availability' | 'preferences' | 'validation'

/** One real step of the generator, with the numbers it produced. */
export interface GenerationStage {
  id: StageId
  label: string
  detail: string
}

export interface GenerateResult {
  /** `valid`: every hard constraint holds. Otherwise the best attempt and why it fails. */
  status: 'valid' | 'no-valid-schedule'
  plan: Plan
  /** Why each placement is where it is, keyed "courseId@term". */
  reasons: Record<string, PlacementReason[]>
  validation: ValidationReport
  stages: GenerationStage[]
  /** For `no-valid-schedule`: the structured reasons. */
  problems: Finding[]
  /** Plain-English notes about compromises (short terms, unplaceable requests). */
  notes: string[]
}

const MAX_FULL_ATTEMPTS = 40
const MAX_TRACK_SEARCHES = 160

/**
 * Builds a complete plan from the student's start term to senior spring.
 *
 * Deterministic: the same inputs always produce the same plan. Lanes (one per
 * graduation requirement) are searched in dependency order with backtracking;
 * electives fill the remaining capacity; the result must pass the same
 * validator the planner uses before it is returned as valid.
 */
export function generatePlan(input: GenerateInput): GenerateResult {
  const { catalog, student } = input
  const pins = input.pins ?? []
  const required = [...new Set(input.require ?? [])].filter((id) => catalog.courses.has(id))
  const prefs: Preferences = {
    ...input.preferences,
    targetCourses: [...new Set([...input.preferences.targetCourses, ...required])],
  }
  const model = buildPreferenceModel(prefs, catalog.school)
  const excluded = new Set([...(input.exclude ?? [])].filter((id) => !required.includes(id)))
  const fixed = [...input.history, ...pins]
  const stages: GenerationStage[] = []

  // Stage 1: requirements.
  const baseProgress = allocateRequirements(catalog, input.history)
  const creditsDone = baseProgress.total.completed + baseProgress.total.inProgress
  stages.push({
    id: 'requirements',
    label: 'Analyzing requirements',
    detail: `${catalog.school.requirements.length} graduation requirements · ${fmt(creditsDone)} of ${fmt(catalog.school.totalCredits)} credits done`,
  })

  // Stage 2: prerequisites.
  const links = [...catalog.courses.values()].reduce(
    (n, c) => n + c.prerequisites.reduce((m, g) => m + g.anyOf.length, 0),
    0,
  )
  const depths = prerequisiteDepths(catalog)
  const longest = Math.max(0, ...depths.values()) + 1
  stages.push({
    id: 'prerequisites',
    label: 'Mapping prerequisites',
    detail: `${catalog.courses.size} courses · ${links} prerequisite links · longest chain ${longest} courses`,
  })

  // Stage 3: availability and reachability from where the student is.
  const earliest = earliestStarts(catalog, input.history, student.startTerm)
  let options = 0
  let reachableCourses = 0
  for (const course of catalog.courses.values()) {
    const first = earliest.get(course.id)
    if (!first || first.taken || first.term === null) continue
    reachableCourses++
    for (let t = first.term; t < TERM_COUNT; t++) if (!availabilityProblem(course, t)) options++
  }
  stages.push({
    id: 'availability',
    label: 'Evaluating course availability',
    detail: `${reachableCourses} courses reachable · ${options} course-and-term options open to you`,
  })

  const lanes = buildLanes(catalog, model, fixed)
  const reasons = new Map<string, PlacementReason[]>()
  for (const p of input.history) {
    reasons.set(reasonKey(p.courseId, p.term), [
      { kind: 'history', text: p.status === 'completed' ? 'You completed this course.' : 'You are taking this course now.' },
    ])
  }
  for (const p of pins) reasons.set(reasonKey(p.courseId, p.term), [{ kind: 'pinned', text: 'You placed this course here.' }])

  let tracksEvaluated = 0
  let trackSearches = 0
  let attempts = 0
  let best: { plan: Plan; validation: ValidationReport; reasons: Map<string, PlacementReason[]>; notes: string[] } | null = null
  const laneFailures = new Map<string, Lane>()

  const attempt = (ctx: PlanningContext, trackReasons: Map<string, PlacementReason[]>, laneCourseIds: Set<string>) => {
    attempts++
    const filled = ctx.clone()
    const allReasons = new Map([...reasons, ...trackReasons])
    const fill = fillElectives({
      catalog,
      ctx: filled,
      model,
      startTerm: student.startTerm,
      excluded,
      required,
      laneCourseIds,
      reasons: allReasons,
    })
    const plan: Plan = { placements: sortPlacements(filled.placements) }
    const validation = validatePlan(catalog, student, plan, prefs)
    const notes = [
      ...fill.shortTerms.map((s) => s.explanation),
      ...fill.unplaced.map((id) => `${catalog.courses.get(id)?.name ?? id} could not be placed in any remaining term.`),
    ]
    const candidate = { plan, validation, reasons: allReasons, notes }
    if (!best || rankAttempt(candidate.validation) < rankAttempt(best.validation)) best = candidate
    return validation.graduationPathValid && fill.unplaced.length === 0 ? candidate : null
  }

  const search = (
    index: number,
    ctx: PlanningContext,
    trackReasons: Map<string, PlacementReason[]>,
    laneCourseIds: Set<string>,
  ): ReturnType<typeof attempt> => {
    if (index === lanes.length) return attempt(ctx, trackReasons, laneCourseIds)
    if (attempts >= MAX_FULL_ATTEMPTS || trackSearches >= MAX_TRACK_SEARCHES) return null
    const lane = lanes[index]!
    trackSearches++
    const base = { catalog, ctx, lane, model, startTerm: student.startTerm, excluded, required: new Set(required) }
    let tracks: Track[] = enumerateTracks({ ...base, strict: true })
    if (tracks.length === 0 && lane.everyTerm) tracks = enumerateTracks({ ...base, strict: false })
    tracksEvaluated += tracks.length
    if (tracks.length === 0) {
      laneFailures.set(lane.id, lane)
      return null
    }
    for (const track of tracks) {
      const next = ctx.clone()
      for (const p of track.placements) next.add(p)
      const nextReasons = new Map([...trackReasons, ...track.reasons])
      const nextIds = new Set([...laneCourseIds, ...track.placements.map((p) => p.courseId)])
      const found = search(index + 1, next, nextReasons, nextIds)
      if (found) return found
      if (attempts >= MAX_FULL_ATTEMPTS || trackSearches >= MAX_TRACK_SEARCHES) return null
    }
    return null
  }

  const found = search(0, new PlanningContext(catalog, fixed), new Map(), new Set(fixed.map((p) => p.courseId)))

  stages.push({
    id: 'preferences',
    label: 'Balancing your preferences',
    detail: `${describeGoals(prefs)} · ${tracksEvaluated} pathways compared`,
  })

  // A plan built from history alone, when the search never reached a full attempt.
  const result =
    found ??
    best ??
    (() => {
      const plan: Plan = { placements: sortPlacements(fixed) }
      return { plan, validation: validatePlan(catalog, student, plan, prefs), reasons, notes: [] as string[] }
    })()

  const errors = result.validation.findings.filter((f) => f.severity === 'error')
  stages.push({
    id: 'validation',
    label: 'Validating four-year reachability',
    detail: `${result.validation.checks.length} checks · ${
      result.plan.placements.filter((p) => p.status === 'planned').length
    } courses placed · ${errors.length === 0 ? 'no conflicts' : `${errors.length} conflict${errors.length === 1 ? '' : 's'}`}`,
  })

  const problems: Finding[] = found ? [] : [...laneProblems(laneFailures), ...errors]
  return {
    status: found ? 'valid' : 'no-valid-schedule',
    plan: result.plan,
    reasons: Object.fromEntries(result.reasons),
    validation: result.validation,
    stages,
    problems: dedupeFindings(problems),
    notes: result.notes,
  }
}

function rankAttempt(v: ValidationReport): number {
  const errors = v.findings.filter((f) => f.severity === 'error').length
  const warnings = v.findings.filter((f) => f.severity === 'warning').length
  return errors * 1000 + warnings
}

function laneProblems(failures: Map<string, Lane>): Finding[] {
  return [...failures.values()].map((lane) => ({
    id: `lane-unsatisfiable:${lane.id}`,
    check: 'requirements' as const,
    code: 'lane-unsatisfiable',
    severity: 'error' as const,
    requirementId: lane.id,
    message:
      lane.missingGroups.length > 0
        ? `Compass couldn't fit ${lane.requirement.name} into your remaining terms: it still needs ${lane.missingGroups
            .map((g) => g.label)
            .join(', ')}, and the courses that count aren't open to you in the terms left.`
        : lane.deficit > 0
          ? `Compass couldn't fit ${lane.requirement.name} into your remaining terms: you still need ${fmt(lane.deficit)} credit${lane.deficit === 1 ? '' : 's'}, and there aren't enough open terms for them alongside your other requirements.`
          : `Compass couldn't fit ${lane.requirement.name} into your remaining terms alongside your other courses without breaking a prerequisite, grade, or season rule.`,
    source: lane.requirement.source,
  }))
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
}

export function sortPlacements(placements: Placement[]): Placement[] {
  return [...placements].sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId))
}

function describeGoals(prefs: Preferences): string {
  const goals = prefs.goals.map((g) => GOAL_LABELS[g])
  const rigor = {
    balanced: 'balanced workload',
    challenging: 'challenging workload',
    'very-rigorous': 'very rigorous workload',
    maximum: 'maximum rigor',
  }[prefs.rigor]
  if (goals.length === 0) return rigor
  return `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${rigor}`
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}
