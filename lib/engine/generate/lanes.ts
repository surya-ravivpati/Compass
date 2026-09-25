import type { Catalog } from '../catalog.ts'
import { ancestors, descendants } from '../graph.ts'
import { evaluatePrerequisites, overlaySpans, type SpanLookup } from '../prereqs.ts'
import { allocateRequirements, countsTowardAt } from '../requirements.ts'
import { occupiedTerms, yearOfTerm } from '../terms.ts'
import { TERM_COUNT, type Course, type MustInclude, type Placement, type Policy, type Requirement, type TermIndex } from '../types.ts'
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
  /** The part of `affinity` that isn't interest (college plans, rigor, balance). */
  baseAffinity: number
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

/** Re-plan bonuses: staying in the same term, and staying in the plan at all. */
export const ANCHOR_SAME_TERM = 8
export const ANCHOR_KEPT = 4

/**
 * One lane per category requirement, plus one per every-term policy no
 * requirement carries, ordered so a lane comes after any lane whose courses
 * it depends on (science after math, because chemistry needs algebra).
 */
export function buildLanes(catalog: Catalog, model: PreferenceModel, fixed: Placement[]): Lane[] {
  const progress = allocateRequirements(catalog, fixed)
  const lanes: Lane[] = []
  const everyTermPolicies = catalog.school.policies.filter((p): p is Extract<Policy, { kind: 'every-term' }> => p.kind === 'every-term')
  for (const r of progress.requirements) {
    const req = r.requirement
    if (req.kind !== 'category') continue
    const satisfying = [...catalog.courses.values()].filter((c) => c.satisfies.includes(req.id))
    const department = dominant(satisfying.map((c) => c.department))
    // A requirement carries its department's every-term rule only when every
    // course there counts toward it: Health sits beside P.E., but "P.E. every
    // semester" doesn't make Health an every-semester course.
    const coversDepartment = [...catalog.courses.values()].every((c) => c.department !== department || c.satisfies.includes(req.id))
    const policy = coversDepartment ? everyTermPolicies.find((p) => p.department === department) : undefined
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
    let baseAffinity = -4
    if (model.college && (department === 'science' || department === 'world-language')) baseAffinity += 2
    if (model.desiredLevel >= 1.8 && ['math', 'science', 'world-language', 'english'].includes(department)) baseAffinity += 1.5
    if (model.balanceFirst) baseAffinity -= 1.5
    let affinity = baseAffinity + 3 * interest
    if (everyTerm) affinity = Math.max(affinity, 2)
    const lane: Lane = {
      id: req.id,
      requirement: req,
      department,
      subject: subjectName(catalog, department) ?? req.name.toLowerCase(),
      courseIds,
      everyTerm,
      ...(policy ? { everyTermPolicyLabel: policy.label } : {}),
      deficit: r.remaining,
      missingGroups,
      sameSequence: !!req.sameSequence,
      affinity,
      baseAffinity,
    }
    if (lane.deficit > 0 || lane.missingGroups.length > 0 || lane.everyTerm || lane.affinity > 0) lanes.push(lane)
  }
  // An every-term rule whose subject no requirement counts on its own (P.E.
  // every semester, its credits in the general bucket) still needs a lane,
  // or nothing would schedule it.
  for (const policy of everyTermPolicies) {
    if (lanes.some((l) => l.everyTerm && l.department === policy.department)) continue
    const courseIds = [...catalog.courses.values()]
      .filter((c) => c.department === policy.department || policy.alsoCounts?.includes(c.id))
      .map((c) => c.id)
      .sort()
    if (courseIds.length === 0) continue
    const name = catalog.departments.get(policy.department)?.name ?? policy.department
    lanes.push({
      id: `policy:${policy.id}`,
      requirement: { id: `policy:${policy.id}`, name, description: policy.label, credits: 0, kind: 'category', source: policy.source },
      department: policy.department,
      subject: subjectName(catalog, policy.department) ?? name.toLowerCase(),
      courseIds,
      everyTerm: true,
      everyTermPolicyLabel: policy.label,
      deficit: 0,
      missingGroups: [],
      sameSequence: false,
      affinity: 2,
      baseAffinity: 2,
    })
  }
  return orderLanes(catalog, lanes)
}

/** A department's mid-sentence name: "math", "social studies", "English". */
function subjectName(catalog: Catalog, departmentId: string): string | undefined {
  const department = catalog.departments.get(departmentId)
  return department ? (department.shortName ?? department.name.toLowerCase()) : undefined
}

/**
 * The next level of a sequence right after the previous one (French 2 the
 * year after French 1) is 1; after a gap it is -1; anything else is 0.
 */
export function sequenceContinuity(catalog: Catalog, spans: SpanLookup, course: Course, term: TermIndex): number {
  if (!course.sequence || course.sequence.step <= 1) return 0
  let last: number | undefined
  for (const other of catalog.courses.values()) {
    if (other.sequence?.id !== course.sequence.id || other.sequence.step >= course.sequence.step) continue
    for (const span of spans.get(other.id) ?? []) {
      if (span.start < term && (last === undefined || span.end > last)) last = span.end
    }
  }
  if (last === undefined) return 0
  return last >= term - 1 ? 1 : -1
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
  // Among lanes whose prerequisites are placed, every-term lanes go first:
  // they need a slot in every semester, so they get them before optional
  // lanes fill up. A dependency cycle yields to the most constrained lane.
  const constrained = (a: Lane, b: Lane) => Number(b.everyTerm) - Number(a.everyTerm) || b.deficit - a.deficit
  const ordered: Lane[] = []
  const done = new Set<string>()
  while (ordered.length < lanes.length) {
    const left = lanes.filter((l) => !done.has(l.id))
    const ready = left.filter((l) => [...deps.get(l.id)!].every((d) => done.has(d)))
    const next = ready.find((l) => l.everyTerm) ?? ready[0] ?? [...left].sort(constrained)[0]!
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
  /** Where courses sat in the plan being re-planned, by course. */
  anchors?: Map<string, Set<TermIndex>>
}

/**
 * Candidate tracks for one lane: a beam search, year by year, over what the
 * lane holds each year (nothing, a full-year course, or up to two semester
 * courses). Hard constraints prune; preferences only rank.
 */
export function enumerateTracks(search: TrackSearch): Track[] {
  const { catalog, ctx, lane, model } = search
  const laneSet = new Set(lane.courseIds)
  const started = ctx.placements.some((p) => laneSet.has(p.courseId) && catalog.courses.get(p.courseId)?.sequence)
  const order = lane.sameSequence && !started ? sequenceOrder(catalog, lane, model) : []
  if (order.length === 0) return tracksFor(search, undefined)
  // The student's language first, then the school's order: a sequence that
  // can't be started (dropped, or no room left for it) hands over to the next,
  // so a missing Spanish 1 never reads as "no language fits".
  for (const id of order) {
    const tracks = tracksFor(search, id)
    if (tracks.length > 0) return tracks
  }
  return []
}

function tracksFor(search: TrackSearch, preferredSequence: string | undefined): Track[] {
  const { catalog, ctx, lane, model, startTerm } = search
  const maxLoad = catalog.school.load.max
  const beamWidth = search.beamWidth ?? 40
  const leveled = new Set([...catalog.courses.values()].filter((c) => c.level !== 'standard').map((c) => c.department))
  const laneSet = new Set(lane.courseIds)

  // Lane slots already held by history or pinned courses.
  const fixedTerms = new Set<TermIndex>()
  let sequence: SearchState['sequence']
  // When the first fixed course of the sequence ends: a year before a pinned
  // Spanish 1 is not a gap in the language.
  let firstSequenceEnd = Infinity
  for (const p of ctx.placements) {
    if (!laneSet.has(p.courseId)) continue
    const course = catalog.courses.get(p.courseId)!
    for (const t of occupiedTerms(p.term, course.durationTerms)) fixedTerms.add(t)
    if (lane.sameSequence && course.sequence && (!sequence || course.sequence.step > sequence.step)) {
      sequence = { id: course.sequence.id, step: course.sequence.step }
    }
    if (lane.sameSequence && course.sequence) firstSequenceEnd = Math.min(firstSequenceEnd, p.term + course.durationTerms - 1)
  }

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
      // A pinned semester course holds only half the year: a full-year course
      // can still run alongside it (Discrete Math pinned in the fall doesn't
      // shut AP Calculus BC out of senior year).
      if (fall >= startTerm) for (const c of candidates(state, state.overlay, fall, 2)) options.push([{ course: c, term: fall }])
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
      if (countsTowardAt(course, lane.id, term)) credits += course.credits
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
    const begun = firstSequenceEnd < fall || state.overlay.placements.length > 0
    const stopped = state.stopped || (lane.sameSequence && !!sequenceState && skipped && begun)
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
    // A course that only counts from a later grade is no progress yet.
    const useful = countsTowardAt(course, lane.id, term) ? Math.min(course.credits, Math.max(0, open)) : 0
    score += useful * 12

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
      // A lane several departments share names the course's own subject.
      const subject = course.department === lane.department ? lane.subject : (subjectName(catalog, course.department) ?? lane.subject)
      reasons.push({ kind: 'pathway', text: `The next step after ${prev.name} in your ${subject} pathway.` })
    }
    // A same-sequence lane already ends at a gap year; elsewhere, the next
    // language level is best the year after the last one.
    if (!lane.sameSequence) score += 3 * sequenceContinuity(catalog, spans, course, term)

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
    // is not where a student asked to be challenged, and a subject with no
    // honors or AP courses offers no level to choose.
    const core = (catalog.departments.get(course.department)?.lane ?? false) && leveled.has(course.department)
    const rigor = rigorScore(model, course, core ? 3 : 1)
    score += rigor
    if (core && model.desiredLevel >= 1.8) score += (course.workload - 3) * 0.8
    if (course.expectsBackground && interestScore(model, course) === 0) score -= 2.5
    if ((course.level === 'honors' || course.level === 'ap' || course.level === 'post-ap') && rigor > -1.5) {
      reasons.push({ kind: 'rigor', text: 'Matches the challenge level you chose.' })
    }

    const interest = interestScore(model, course)
    score += interest * 2
    if (interest > 0) {
      const goals = matchedGoals(model, course)
      if (goals.length) reasons.push({ kind: 'goal', text: `Fits your interest in ${goals.slice(0, 2).join(' and ')}.` })
    }
    // A stand-in from another department (Dance in place of P.E.) is for a
    // student who wants it, not the default.
    if (course.department !== lane.department && interest === 0) score -= 6
    // Two courses in one core subject in a year (Biology and Chemistry as a
    // freshman) should come from the student's interest, not from two
    // requirements each wanting the earliest year.
    if (core && interest === 0 && !lane.everyTerm) {
      const year = yearOfTerm(term)
      const doubled = ctx.placements.some(
        (p) =>
          p.status === 'planned' &&
          p.term >= 0 &&
          yearOfTerm(p.term) === year &&
          !lane.courseIds.includes(p.courseId) &&
          catalog.courses.get(p.courseId)?.department === course.department,
      )
      if (doubled) score -= 3
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
    // In a re-plan, a course already in the plan stays if it can.
    const was = search.anchors?.get(course.id)
    if (was) score += was.has(term) ? ANCHOR_SAME_TERM : ANCHOR_KEPT

    // Keep terms at the student's chosen load where possible.
    for (const t of occupiedTerms(term, course.durationTerms)) {
      if (loadAt(ctx, overlay, t) + 1 > model.targetLoad) score -= 8
    }
    // Credits beyond the requirement follow the student's interest in the
    // course itself, not in everything the requirement covers: interest in
    // the biomedical courses among "required electives" is no reason for
    // three years of music production. And a lane that can't say why a
    // course is there at all leaves the slot to the elective pass.
    const extraAffinity = lane.everyTerm ? lane.affinity : lane.baseAffinity + 3 * Math.min(interest, 2)
    score += (course.credits - useful) * (reasons.length > 0 ? extraAffinity : Math.min(extraAffinity, -4))
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

/** The language a student asked for first, then the sequences in the school's order. */
function sequenceOrder(catalog: Catalog, lane: Lane, model: PreferenceModel): string[] {
  const sequences: string[] = []
  for (const course of catalog.school.courses) {
    if (lane.courseIds.includes(course.id) && course.sequence && !sequences.includes(course.sequence.id)) {
      sequences.push(course.sequence.id)
    }
  }
  if (model.language && sequences.includes(model.language)) return [model.language, ...sequences.filter((id) => id !== model.language)]
  return sequences
}
