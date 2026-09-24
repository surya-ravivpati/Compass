import { courseName, type Catalog } from './catalog.ts'
import { earliestStarts, limitingChain } from './graph.ts'
import type { PlacementReason } from './generate/lanes.ts'
import {
  describeGroup,
  evaluatePrerequisites,
  indexSpans,
  joinAnd,
  type SatisfiedHow,
  type SpanLookup,
} from './prereqs.ts'
import type { ProgressReport } from './requirements.ts'
import { availabilityProblem, gradeList, placementPhrase, termLabel } from './terms.ts'
import {
  BEFORE_HIGH_SCHOOL,
  TERM_COUNT,
  type Course,
  type Placement,
  type Plan,
  type SourceRef,
  type StudentState,
  type TermIndex,
} from './types.ts'
import { prerequisiteMessage } from './validate.ts'

export interface ExplanationFact {
  kind: 'prerequisite' | 'timing' | 'requirement' | 'policy' | 'unlock' | 'goal' | 'history' | 'consequence' | 'note'
  text: string
  source?: SourceRef
}

export interface PrerequisiteLink {
  /** "Algebra 2 or Honors Algebra 2" */
  label: string
  note?: string
  satisfiedBy: { courseId: string; term: TermIndex; how: SatisfiedHow } | null
}

export interface UnlockLink {
  courseId: string
  term: TermIndex | null
}

export interface PlacementExplanation {
  courseId: string
  term: TermIndex
  /** One or two sentences a fifteen-year-old can follow. */
  headline: string
  facts: ExplanationFact[]
  prerequisites: PrerequisiteLink[]
  unlocks: UnlockLink[]
  countsToward: { requirementId: string; name: string; credits: number }[]
  earliestPossible: TermIndex | null
  source: SourceRef
}

/**
 * Why a course sits where it does in a plan, built only from catalog data,
 * the plan itself, and the generator's recorded reasons -- never guessed.
 */
export function explainPlacement(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  placement: Placement,
  options: { reasons?: PlacementReason[]; progress?: ProgressReport } = {},
): PlacementExplanation {
  const course = catalog.courses.get(placement.courseId)!
  const others = plan.placements.filter((p) => !(p.courseId === placement.courseId && p.term === placement.term))
  const spans = indexSpans(catalog, others)
  const facts: ExplanationFact[] = []

  const result = placement.term === BEFORE_HIGH_SCHOOL ? null : evaluatePrerequisites(course, placement.term, spans)
  const prerequisites: PrerequisiteLink[] = course.prerequisites.map((group, i) => {
    const match = result?.groups[i]?.match
    return {
      label: describeGroup(catalog, group),
      ...(group.note ? { note: group.note } : {}),
      satisfiedBy: match ? { courseId: match.span.courseId, term: match.span.start, how: match.how } : null,
    }
  })

  const unlocks: UnlockLink[] = (catalog.dependents.get(course.id) ?? []).map((id) => {
    const inPlan = plan.placements.find((p) => p.courseId === id)
    return { courseId: id, term: inPlan ? inPlan.term : null }
  })

  const countsToward = (options.progress?.requirements ?? [])
    .flatMap((r) =>
      r.allocations
        .filter((a) => a.courseId === course.id && a.term === placement.term)
        .map((a) => ({ requirementId: r.requirement.id, name: r.requirement.name, credits: a.credits })),
    )

  const earliest = earliestTermInPlan(catalog, student, course, spans)
  const where = placementPhrase(placement.term, course.durationTerms)
  let headline: string

  if (placement.status === 'completed') {
    headline =
      placement.term === BEFORE_HIGH_SCHOOL
        ? `You completed ${course.name} before high school.`
        : `You completed ${course.name} in ${where}.`
    facts.push({ kind: 'history', text: headline })
  } else if (placement.status === 'in-progress') {
    headline = `You're taking ${course.name} now.`
    facts.push({ kind: 'history', text: headline })
  } else {
    const limiting = result?.groups
      .map((g) => g.match)
      .filter((m) => m !== null && m.how !== 'completed-before')
      .sort((a, b) => b!.span.end - a!.span.end)[0]
    const policy = catalog.school.policies.find((p) => p.kind === 'placement' && p.courseIds.includes(course.id))
    const minGrade = Math.min(...course.grades)
    if (earliest !== null && placement.term > earliest) {
      const why = (options.reasons ?? []).find((r) => r.kind !== 'requirement' && r.kind !== 'every-term')
      headline = `${course.name} could start as early as ${placementPhrase(earliest, course.durationTerms)}. It's in ${where}${
        why ? ` — ${lowerFirst(why.text).replace(/\.$/, '')}` : ', where it fits alongside the rest of your plan'
      }.`
    } else if (limiting) {
      const prev = catalog.courses.get(limiting.span.courseId)!
      headline =
        limiting.how === 'concurrent'
          ? `${course.name} is in ${where} because it goes alongside ${prev.name}, which your plan has in ${placementPhrase(limiting.span.start, prev.durationTerms)}.`
          : `${course.name} is in ${where} because it needs ${prev.name} first, and your plan has ${prev.name} in ${placementPhrase(limiting.span.start, prev.durationTerms)}.`
    } else if (policy && policy.kind === 'placement') {
      headline = `${course.name} is in ${where} because ${lowerFirst(policy.label)}.`
    } else if (placement.term === earliest && placement.term >= 0 && 9 + Math.floor(placement.term / 2) === minGrade && minGrade > 9) {
      headline = `${course.name} is open to ${gradeList(course.grades)}, so ${where} is the earliest you can take it.`
    } else {
      const why = (options.reasons ?? [])[0]
      headline = why ? `${course.name} is in ${where}. ${why.text}` : `${course.name} is in ${where}.`
    }
  }

  // Prerequisite facts, from the catalog.
  prerequisites.forEach((link) => {
    if (link.satisfiedBy) {
      const pre = catalog.courses.get(link.satisfiedBy.courseId)!
      const when =
        link.satisfiedBy.term === BEFORE_HIGH_SCHOOL
          ? 'before high school'
          : placementPhrase(link.satisfiedBy.term, pre.durationTerms)
      facts.push({
        kind: 'prerequisite',
        text: `Needs ${link.label}. Covered by ${pre.name} (${when}).`,
        source: course.source,
      })
    } else if (placement.status === 'planned') {
      facts.push({ kind: 'prerequisite', text: `Needs ${link.label}. Not covered yet.`, source: course.source })
    }
    if (link.note) facts.push({ kind: 'note', text: `Catalog note: ${link.note}`, source: course.source })
  })
  for (const note of course.notes ?? []) facts.push({ kind: 'note', text: `Catalog note: ${note}`, source: course.source })

  for (const c of countsToward) {
    facts.push({ kind: 'requirement', text: `Counts ${c.credits} credit${c.credits === 1 ? '' : 's'} toward ${c.name}.` })
  }

  for (const policy of catalog.school.policies) {
    if (policy.kind === 'placement' && policy.courseIds.includes(course.id)) {
      facts.push({ kind: 'policy', text: `${policy.label}.`, source: policy.source })
    }
    if (policy.kind === 'every-term' && policy.department === course.department) {
      facts.push({ kind: 'policy', text: `${policy.label}.`, source: policy.source })
    }
  }

  for (const reason of options.reasons ?? []) {
    if (reason.kind === 'goal' || reason.kind === 'rigor' || reason.kind === 'target' || reason.kind === 'fill') {
      facts.push({ kind: 'goal', text: reason.text })
    }
  }

  const openedInPlan = unlocks.filter((u) => u.term !== null)
  if (openedInPlan.length) {
    facts.push({
      kind: 'unlock',
      text: `Opens ${joinAnd(openedInPlan.map((u) => courseName(catalog, u.courseId)))} in your plan.`,
    })
  }

  if (placement.status === 'planned') {
    const consequence = laterConsequence(catalog, plan, placement, course)
    if (consequence) facts.push({ kind: 'consequence', text: consequence })
  }

  return {
    courseId: course.id,
    term: placement.term,
    headline,
    facts,
    prerequisites,
    unlocks,
    countsToward,
    earliestPossible: earliest,
    source: course.source,
  }
}

/** First term the course could start given everything else in the plan. */
function earliestTermInPlan(catalog: Catalog, student: StudentState, course: Course, spans: SpanLookup): TermIndex | null {
  for (let t = Math.max(0, student.startTerm); t < TERM_COUNT; t++) {
    if (availabilityProblem(course, t)) continue
    if (evaluatePrerequisites(course, t, spans).satisfied) return t
  }
  return null
}

/** What moving a course one year later would break downstream. */
function laterConsequence(catalog: Catalog, plan: Plan, placement: Placement, course: Course): string | null {
  const later = placement.term + 2
  if (later >= TERM_COUNT || availabilityProblem(course, later)) return null
  const moved = plan.placements.map((p) => (p === placement ? { ...p, term: later } : p))
  const spans = indexSpans(catalog, moved)
  const broken: string[] = []
  for (const p of moved) {
    if (p.status !== 'planned' || p.courseId === course.id) continue
    const dependent = catalog.courses.get(p.courseId)
    if (!dependent || !dependent.prerequisites.some((g) => g.anyOf.some((o) => o.courseId === course.id))) continue
    if (!evaluatePrerequisites(dependent, p.term, spans).satisfied) broken.push(dependent.name)
  }
  if (broken.length === 0) return null
  return `Moving ${course.name} a year later would push ${joinAnd(broken)} ahead of ${
    broken.length === 1 ? 'its prerequisite' : 'their prerequisites'
  }.`
}

export interface WhyNot {
  courseId: string
  /** Can it fit before graduation at all, from where the student is now? */
  reachable: boolean
  earliestTerm: TermIndex | null
  /** Prerequisite chain that sets the earliest term, first course first. */
  chain: string[]
  /** Why it can't go in the asked-for term, if one was given. */
  blockers: string[]
  explanation: string
}

/**
 * "Why can't I take this course yet?" -- answered by walking the
 * prerequisite graph from what the student has already taken.
 */
export function whyNot(
  catalog: Catalog,
  student: StudentState,
  plan: Plan,
  courseId: string,
  term?: TermIndex,
): WhyNot {
  const course = catalog.courses.get(courseId)!
  const history = plan.placements.filter((p) => p.status !== 'planned')
  const earliest = earliestStarts(catalog, history, student.startTerm)
  const info = earliest.get(courseId)
  const chain = limitingChain(catalog, earliest, courseId).reverse()
  const blockers: string[] = []

  if (term !== undefined) {
    const problem = availabilityProblem(course, term)
    if (problem) blockers.push(problem.message)
    if (term < student.startTerm) blockers.push(`${termLabel(term)} has already passed.`)
    const others = plan.placements.filter((p) => p.courseId !== courseId)
    const spans = indexSpans(catalog, others)
    const result = evaluatePrerequisites(course, term, spans)
    for (const group of result.groups) {
      if (!group.match) blockers.push(prerequisiteMessage(catalog, course, term, group, spans))
    }
  }

  let explanation: string
  if (info?.taken) {
    explanation = `You've already ${history.find((p) => p.courseId === courseId)?.status === 'completed' ? 'completed' : 'started'} ${course.name}.`
  } else if (!info || info.term === null) {
    explanation =
      chain.length > 1
        ? `${course.name} can't fit before graduation. It sits at the end of a chain — ${chain
            .map((id) => courseName(catalog, id))
            .join(' → ')} — and there aren't enough terms left to finish the courses before it.`
        : `${course.name} can't fit in the terms you have left: ${availabilityProblem(course, TERM_COUNT - course.durationTerms)?.message ?? 'no remaining term is open to you'}.`
  } else if (chain.length > 1) {
    const steps = chain.slice(0, -1).map((id) => courseName(catalog, id))
    const direct = steps[steps.length - 1]!
    const earlier = steps.slice(0, -1).reverse()
    explanation = `${course.name} needs ${direct} first${
      earlier.length ? `, which comes after ${earlier.join(', which comes after ')}` : ''
    }. From where you are now, the earliest it can start is ${placementPhrase(info.term, course.durationTerms)}.`
  } else {
    explanation = `${course.name} has no prerequisites you still need. The earliest it can start is ${placementPhrase(
      info.term,
      course.durationTerms,
    )}${course.grades.length < 4 ? ` (it's open to ${gradeList(course.grades)})` : ''}.`
  }

  return {
    courseId,
    reachable: !!info && (info.taken || info.term !== null),
    earliestTerm: info?.term ?? null,
    chain,
    blockers,
    explanation,
  }
}

function lowerFirst(text: string): string {
  if (/^(AP|U\.S\.|[A-Z]{2,})/.test(text)) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}
