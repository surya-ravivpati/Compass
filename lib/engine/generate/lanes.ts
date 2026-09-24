import type { Catalog } from '../catalog.ts'
import { ancestors, descendants } from '../graph.ts'
import { evaluatePrerequisites, overlaySpans } from '../prereqs.ts'
import { allocateRequirements } from '../requirements.ts'
import { occupiedTerms, yearOfTerm } from '../terms.ts'
import { TERM_COUNT, type Course, type MustInclude, type Placement, type Requirement, type TermIndex } from '../types.ts'
import { emptyOverlay, extendOverlay, infeasibility, loadAt, type Overlay, type PlanningContext } from './context.ts'
import { interestScore, matchedGoals, rigorScore, workloadScore, type PreferenceModel } from './preferences.ts'

export interface PlacementReason {
  kind: 'history' | 'pinned' | 'requirement' | 'pathway' | 'policy' | 'every-term' | 'goal' | 'target' | 'rigor' | 'fill'
  text: string
  requirementId?: string
  policyId?: string
}

export interface Lane {
  /** The requirement this lane satisfies. */
  id: string
  requirement: Requirement
  department: string
  subject: string
  courseIds: string[]
  everyTerm: boolean
  everyTermPolicyLabel?: string
  deficit: number
  missingGroups: MustInclude[]
  sameSequence: boolean
  /** Score per credit beyond the requirement: how much the student wants more. */
  affinity: number
}

export interface Track {
  lane: Lane
  placements: Placement[]
  reasons: Map<string, PlacementReason[]>
  score: number
  credits: number
  /** Terms an every-term lane could not cover (relaxed search only). */
  uncovered: TermIndex[]
  key: string
}

export const reasonKey = (courseId: string, term: TermIndex) => `${courseId}@${term}`

/**
 * One lane per category requirement, ordered so a lane comes after any lane
 * whose courses it depends on (science after math, because chemistry needs
 * algebra).
 */
export function buildLanes(catalog: Catalog, model: PreferenceModel, fixed: Placement[]): Lane[] {
  const progress = allocateRequirements(catalog, fixed)
  const lanes: Lane[] = []
  for (const r of progress.requirements) {
    const req = r.requirement
    if (req.kind !== 'category') continue
    const satisfying = [...catalog.courses.values()].filter((c) => c.satisfies.includes(req.id))
    const department = dominant(satisfying.map((c) => c.department))
    const policy = catalog.school.policies.find((p) => p.kind === 'every-term' && p.department === department)
    const everyTerm = !!policy
    const courseIds = satisfying
      .filter((c) => !everyTerm || c.department === department)
      .map((c) => c.id)
      .sort()
    const missingGroups = r.mustInclude.filter((m) => !m.satisfiedBy).map((m) => m.group)
    const tags = new Set(satisfying.flatMap((c) => c.tags))
    let interest = 0
    for (const tag of tags) interest += model.interests.get(tag) ?? 0
    interest = Math.min(interest, 2)
    let affinity = -4 + 3 * interest
    if (model.college && (department === 'science' || department === 'world-language')) affinity += 2
    if (model.desiredLevel >= 1.8 && ['math', 'science', 'world-language', 'english'].includes(department)) affinity += 1.5
    if (model.balanceFirst) affinity -= 1.5
    if (everyTerm) affinity = Math.max(affinity, 2)
    const lane: Lane = {
      id: req.id,
      requirement: req,
      department,
      subject: catalog.departments.get(department)?.name.toLowerCase() ?? req.name.toLowerCase(),
      courseIds,
      everyTerm,
      ...(policy ? { everyTermPolicyLabel: policy.label } : {}),
      deficit: r.remaining,
      missingGroups,
      sameSequence: !!req.sameSequence,
      affinity,
    }
    if (lane.deficit > 0 || lane.missingGroups.length > 0 || lane.everyTerm || lane.affinity > 0) lanes.push(lane)
  }
  return orderLanes(catalog, lanes)
}

function dominant(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''
}

function orderLanes(catalog: Catalog, lanes: Lane[]): Lane[] {
  const owner = new Map<string, string>()
  for (const lane of lanes) for (const id of lane.courseIds) if (!owner.has(id)) owner.set(id, lane.id)
  const deps = new Map<string, Set<string>>(lanes.map((l) => [l.id, new Set<string>()]))
  for (const lane of lanes) {
    for (const id of lane.courseIds) {
      for (const group of catalog.courses.get(id)!.prerequisites) {
        for (const option of group.anyOf) {
          const other = owner.get(option.courseId)
          if (other && other !== lane.id) deps.get(lane.id)!.add(other)
        }
      }
    }
  }
  const ordered: Lane[] = []
  const done = new Set<string>()
  while (ordered.length < lanes.length) {
    const next =
      lanes.find((l) => !done.has(l.id) && [...deps.get(l.id)!].every((d) => done.has(d))) ??
      lanes.find((l) => !done.has(l.id))!
    ordered.push(next)
    done.add(next.id)
  }
  return ordered
}

interface SearchState {
  overlay: Overlay
  score: number
  credits: number
  reasons: Map<string, PlacementReason[]>
  covered: Set<TermIndex>
  uncovered: TermIndex[]
  satisfied: Set<number>
  sequence?: { id: string; step: number }
  stopped: boolean
  key: string
}

export interface TrackSearch {
  catalog: Catalog
  ctx: PlanningContext
  lane: Lane
  model: PreferenceModel
  startTerm: TermIndex
  excluded: Set<string>
  required: Set<string>
  /** Strict: an every-term lane must cover every term. */
  strict: boolean
  beamWidth?: number
  keep?: number
}

/**
 * Candidate tracks for one lane: a beam search, year by year, over what the
 * lane holds each year (nothing, a full-year course, or up to two semester
 * courses). Hard constraints prune; preferences only rank.
 */
export function enumerateTracks(search: TrackSearch): Track[] {
  const { catalog, ctx, lane, model, startTerm } = search
  const maxLoad = catalog.school.load.max
  const beamWidth = search.beamWidth ?? 40
  const laneSet = new Set(lane.courseIds)

  // Lane slots already held by history or pinned courses.
  const fixedTerms = new Set<TermIndex>()
  let sequence: SearchState['sequence']
  for (const p of ctx.placements) {
    if (!laneSet.has(p.courseId)) continue
    const course = catalog.courses.get(p.courseId)!
    for (const t of occupiedTerms(p.term, course.durationTerms)) fixedTerms.add(t)
    if (lane.sameSequence && course.sequence && (!sequence || course.sequence.step > sequence.step)) {
      sequence = { id: course.sequence.id, step: course.sequence.step }
    }
  }
  const preferredSequence = lane.sameSequence && !sequence ? preferredSequenceId(catalog, lane, model) : undefined

  let states: SearchState[] = [
    {
      overlay: emptyOverlay(),
      score: 0,
      credits: 0,
      reasons: new Map(),
      covered: new Set(fixedTerms),
      uncovered: [],
      satisfied: new Set(),
      ...(sequence ? { sequence } : {}),
      stopped: false,
      key: '',
    },
  ]

  const startYear = Math.floor(startTerm / 2)
  // A lane holds at most one course per term -- one credit a year -- so a
  // student who starts late may not be able to cover the whole deficit here.
  const freeYears: number[] = []
  for (let y = startYear; y < TERM_COUNT / 2; y++) {
    if (!fixedTerms.has(y * 2) || !fixedTerms.has(y * 2 + 1)) freeYears.push(y)
  }
  const target = Math.min(lane.deficit, freeYears.length)

  for (let year = startYear; year < TERM_COUNT / 2; year++) {
    const fall = year * 2
    const spring = fall + 1
    const freeYearsAfter = freeYears.filter((y) => y > year).length
    const next: SearchState[] = []
    for (const state of states) {
      for (const picks of optionsFor(state, fall, spring)) {
        next.push(applyPicks(state, picks, fall, spring))
      }
    }
    let kept = next.filter((s) => {
      if (lane.everyTerm && search.strict && (!s.covered.has(fall) || !s.covered.has(spring))) return false
      return s.credits + freeYearsAfter + 1e-9 >= target
    })
    if (lane.everyTerm && !search.strict) {
      kept = kept.map((s) => {
        const gaps = [fall, spring].filter((t) => !s.covered.has(t))
        if (gaps.length === 0) return s
        return { ...s, score: s.score - 30 * gaps.length, uncovered: [...s.uncovered, ...gaps] }
      })
    }
    kept.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    states = dedupe(kept).slice(0, beamWidth)
    if (states.length === 0) return []
  }

  const requiredInLane = [...search.required].filter((id) => laneSet.has(id))
  const complete = states
    .filter((s) => s.credits + 1e-9 >= target)
    .filter((s) => lane.missingGroups.every((_, i) => s.satisfied.has(i)))
  // A requested course that can't sit in this lane's own slot (the lane is
  // full with pinned courses, say) is left for the elective pass to place.
  const withRequired = complete.filter((s) => requiredInLane.every((id) => s.overlay.ids.has(id) || ctx.has(id)))
  const tracks = (withRequired.length > 0 ? withRequired : complete)
    .map(
      (s): Track => ({
        lane,
        placements: s.overlay.placements,
        reasons: s.reasons,
        score: s.score,
        credits: s.credits,
        uncovered: s.uncovered,
        key: s.key,
      }),
    )
  return tracks.slice(0, search.keep ?? 8)

  function optionsFor(state: SearchState, fall: TermIndex, spring: TermIndex): Pick[][] {
    const options: Pick[][] = [[]]
    if (state.stopped) return options
    const freeFall = fall >= startTerm && !fixedTerms.has(fall)
    const freeSpring = spring >= startTerm && !fixedTerms.has(spring)
    if (freeFall && freeSpring) {
      for (const c of candidates(state, state.overlay, fall, 2)) options.push([{ course: c, term: fall }])
      const falls = candidates(state, state.overlay, fall, 1)
      for (const a of [null, ...falls]) {
        const overlay = a ? extendOverlay(catalog, state.overlay, { courseId: a.id, term: fall, status: 'planned' }) : state.overlay
        const stateAfterA = a ? advanceSequence(state, a) : state
        for (const b of candidates(stateAfterA, overlay, spring, 1)) {
          options.push(a ? [{ course: a, term: fall }, { course: b, term: spring }] : [{ course: b, term: spring }])
        }
        if (a) options.push([{ course: a, term: fall }])
      }
    } else if (freeFall || freeSpring) {
      const term = freeFall ? fall : spring
      for (const c of candidates(state, state.overlay, term, 1)) options.push([{ course: c, term }])
    }
    return options
  }

  function candidates(state: SearchState, overlay: Overlay, term: TermIndex, duration: 1 | 2): Course[] {
    const out: Course[] = []
    for (const id of lane.courseIds) {
      const course = catalog.courses.get(id)!
      if (course.durationTerms !== duration) continue
      if (lane.sameSequence) {
        if (state.stopped) continue
        if (state.sequence) {
          if (course.sequence?.id !== state.sequence.id || course.sequence.step <= state.sequence.step) continue
        } else if (preferredSequence && course.sequence && course.sequence.id !== preferredSequence) {
          continue
        }
      }
      if (infeasibility(ctx, overlay, course, term, maxLoad, search.excluded)) continue
      out.push(course)
    }
    return out
  }

  function advanceSequence(state: SearchState, course: Course): SearchState {
    if (!lane.sameSequence || !course.sequence) return state
    return { ...state, sequence: { id: course.sequence.id, step: course.sequence.step } }
  }

  function applyPicks(state: SearchState, picks: Pick[], fall: TermIndex, spring: TermIndex): SearchState {
    let overlay = state.overlay
    let score = state.score
    let credits = state.credits
    let sequenceState = state.sequence
    const reasons = new Map(state.reasons)
    const covered = new Set(state.covered)
    const satisfied = new Set(state.satisfied)
    const keyParts: string[] = []
    for (const { course, term } of picks) {
      const creditsBefore = credits
      const scored = scorePick(course, term, overlay, creditsBefore, satisfied)
      score += scored.score
      reasons.set(reasonKey(course.id, term), scored.reasons)
      overlay = extendOverlay(catalog, overlay, { courseId: course.id, term, status: 'planned' })
      credits += course.credits
      for (const t of occupiedTerms(term, course.durationTerms)) covered.add(t)
      lane.missingGroups.forEach((g, i) => {
        if (!satisfied.has(i) && g.anyOf.includes(course.id)) satisfied.add(i)
      })
      if (lane.sameSequence && course.sequence) sequenceState = { id: course.sequence.id, step: course.sequence.step }
      keyParts.push(`${course.id}@${term}`)
    }
    // A same-sequence lane that skips a year after starting is finished:
    // no language 3 after a gap year, no switching languages mid-way.
    const skipped = picks.length === 0 && (fall >= startTerm || spring >= startTerm) && !fixedTerms.has(fall)
    const stopped = state.stopped || (lane.sameSequence && !!sequenceState && skipped)
    return {
      overlay,
      score,
      credits,
      reasons,
      covered,
      uncovered: state.uncovered,
      satisfied,
      ...(sequenceState ? { sequence: sequenceState } : {}),
      stopped,
      key: `${state.key}|${keyParts.join('+') || '-'}`,
    }
  }

  function scorePick(
    course: Course,
    term: TermIndex,
    overlay: Overlay,
    creditsBefore: number,
    satisfied: Set<number>,
  ): { score: number; reasons: PlacementReason[] } {
    const reasons: PlacementReason[] = []
    let score = 0
    const group = lane.missingGroups.findIndex((g, i) => !satisfied.has(i) && g.anyOf.includes(course.id))
    // Credits still owed to named courses ("must include U.S. History") are
    // reserved for them: an unrelated course does not make progress on them.
    const reserved = lane.missingGroups.reduce((sum, g, i) => {
      if (satisfied.has(i) || i === group) return sum
      return sum + Math.min(...g.anyOf.map((id) => catalog.courses.get(id)?.credits ?? 0))
    }, 0)
    const open = group >= 0 ? lane.deficit - creditsBefore : lane.deficit - creditsBefore - reserved
    const useful = Math.min(course.credits, Math.max(0, open))
    score += useful * 12
    score += (course.credits - useful) * lane.affinity

    if (group >= 0) {
      score += 15
      reasons.push({
        kind: 'requirement',
        requirementId: lane.id,
        text: `Required for ${lane.requirement.name}: your school asks for ${lane.missingGroups[group]!.label}.`,
      })
    } else if (useful > 0) {
      reasons.push({
        kind: 'requirement',
        requirementId: lane.id,
        text: `Counts toward ${lane.requirement.name} (${lane.requirement.credits} credits required).`,
      })
    }

    // Pathway continuity: a prerequisite met by an earlier course in this lane.
    const spans = overlaySpans(ctx.spans, overlay.spans)
    const result = evaluatePrerequisites(course, term, spans)
    const laneStep = result.groups.find((g) => g.match && lane.courseIds.includes(g.match.span.courseId))
    if (laneStep?.match) {
      score += 2
      const prev = catalog.courses.get(laneStep.match.span.courseId)!
      reasons.push({ kind: 'pathway', text: `The next step after ${prev.name} in your ${lane.subject} pathway.` })
    }

    if (lane.everyTerm && lane.everyTermPolicyLabel) {
      reasons.push({ kind: 'every-term', text: lane.everyTermPolicyLabel + '.' })
    }

    for (const policy of catalog.school.policies) {
      if (policy.kind !== 'placement' || !policy.courseIds.includes(course.id)) continue
      if (yearOfTerm(term) === policy.grade - 9) {
        score += 20
        reasons.push({ kind: 'policy', policyId: policy.id, text: policy.label + '.' })
      } else {
        score -= 20
      }
    }

    // Rigor matters most in the core academic lanes; a fine-arts or PE credit
    // is not where a student asked to be challenged.
    const core = catalog.departments.get(course.department)?.lane ?? false
    const rigor = rigorScore(model, course, core ? 3 : 1)
    score += rigor
    if (core && model.desiredLevel >= 1.8) score += (course.workload - 3) * 0.8
    if (course.notes?.length && interestScore(model, course) === 0) score -= 2.5
    if ((course.level === 'honors' || course.level === 'ap' || course.level === 'post-ap') && rigor > -1.5) {
      reasons.push({ kind: 'rigor', text: 'Matches the challenge level you chose.' })
    }

    const interest = interestScore(model, course)
    score += interest * 2
    if (interest > 0) {
      const goals = matchedGoals(model, course)
      if (goals.length) reasons.push({ kind: 'goal', text: `Fits your interest in ${goals.slice(0, 2).join(' and ')}.` })
    }

    score += workloadScore(model, course, term)

    if (model.targets.has(course.id)) {
      score += 60
      reasons.push({ kind: 'target', text: 'You asked for this course.' })
    } else if ([...model.targets].some((t) => ancestors(catalog, t).has(course.id))) {
      score += 10
      const target = [...model.targets].find((t) => ancestors(catalog, t).has(course.id))!
      reasons.push({ kind: 'target', text: `Leads to ${catalog.courses.get(target)?.name ?? target}, which you asked for.` })
    }
    if (model.avoid.has(course.id)) score -= 60

    // Keep terms at the student's chosen load where possible.
    for (const t of occupiedTerms(term, course.durationTerms)) {
      if (loadAt(ctx, overlay, t) + 1 > model.targetLoad) score -= 8
    }
    // Earlier is slightly better for required work; later-only courses are unaffected.
    score -= term * 0.05
    // Tiny nudge toward courses that keep doors open, for the curious.
    if (model.desiredLevel >= 1.8) score += Math.min(descendants(catalog, course.id).size, 4) * 0.1

    return { score, reasons: reasons.slice(0, 3) }
  }
}

interface Pick {
  course: Course
  term: TermIndex
}

function dedupe(states: SearchState[]): SearchState[] {
  const seen = new Set<string>()
  const out: SearchState[] = []
  for (const s of states) {
    const signature = s.overlay.placements
      .map((p) => `${p.courseId}@${p.term}`)
      .sort()
      .join(',')
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push(s)
  }
  return out
}

/** The language a student asked for, else the first sequence the school lists. */
function preferredSequenceId(catalog: Catalog, lane: Lane, model: PreferenceModel): string | undefined {
  const sequences: string[] = []
  for (const course of catalog.school.courses) {
    if (lane.courseIds.includes(course.id) && course.sequence && !sequences.includes(course.sequence.id)) {
      sequences.push(course.sequence.id)
    }
  }
  if (model.language && sequences.includes(model.language)) return model.language
  return sequences[0]
}
