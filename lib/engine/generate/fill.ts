import type { Catalog } from '../catalog.ts'
import { ancestors, descendants } from '../graph.ts'
import { evaluatePrerequisites } from '../prereqs.ts'
import { allocateRequirements } from '../requirements.ts'
import { placementPhrase, termLabel, yearOfTerm } from '../terms.ts'
import { TERM_COUNT, type Course, type TermIndex } from '../types.ts'
import { emptyOverlay, infeasibility, type PlanningContext } from './context.ts'
import { reasonKey, type PlacementReason } from './lanes.ts'
import { interestScore, matchedGoals, rigorScore, workloadScore, type PreferenceModel } from './preferences.ts'

export interface FillArgs {
  catalog: Catalog
  ctx: PlanningContext
  model: PreferenceModel
  startTerm: TermIndex
  excluded: Set<string>
  /** Courses the plan must include that no lane placed. */
  required: string[]
  /** Departments whose courses were placed by lanes (the core pathways). */
  laneCourseIds: Set<string>
  reasons: Map<string, PlacementReason[]>
}

export interface FillResult {
  /** Required courses that could not be placed anywhere. */
  unplaced: string[]
  /** Terms left below the school's minimum, with why. */
  shortTerms: { term: TermIndex; count: number; explanation: string }[]
  /** Terms filled past the student's preferred load to reach graduation credits. */
  raisedTerms: TermIndex[]
}

/**
 * Fills each term to the student's target load with electives, year by year
 * so later electives can build on earlier ones. Full-year electives first,
 * then semester courses for the odd slots.
 */
export function fillElectives(args: FillArgs): FillResult {
  const { catalog, ctx, model, startTerm } = args
  const { min, max } = catalog.school.load
  const target = Math.max(min, Math.min(max, model.targetLoad))
  const unplaced: string[] = []
  const none = emptyOverlay()

  // 1. Courses the student asked for that no lane took.
  for (const id of [...args.required].sort()) {
    if (ctx.has(id)) continue
    const course = catalog.courses.get(id)
    if (!course) continue
    let placed = false
    for (let t = startTerm; t < TERM_COUNT; t++) {
      if (infeasibility(ctx, none, course, t, max, args.excluded)) continue
      ctx.add({ courseId: id, term: t, status: 'planned' })
      args.reasons.set(reasonKey(id, t), [{ kind: 'target', text: 'You asked for this course.' }])
      placed = true
      break
    }
    if (!placed) unplaced.push(id)
  }

  // 2. Any category requirement the lanes could not cover.
  const deficits = () =>
    allocateRequirements(catalog, ctx.placements).requirements.filter(
      (r) => r.requirement.kind === 'category' && (r.remaining > 0 || r.mustInclude.some((m) => !m.satisfiedBy)),
    )
  for (const r of deficits()) {
    const missingGroups = r.mustInclude.filter((m) => !m.satisfiedBy).map((m) => m.group.anyOf)
    const pool = [...catalog.courses.values()].filter(
      (c) => c.satisfies.includes(r.requirement.id) && (missingGroups.length === 0 || missingGroups.some((g) => g.includes(c.id))),
    )
    let remaining = r.remaining
    for (const course of rank(pool, startTerm)) {
      if (remaining <= 0 && missingGroups.every((g) => g.some((id) => ctx.has(id)))) break
      for (let t = startTerm; t < TERM_COUNT; t++) {
        if (infeasibility(ctx, none, course, t, max, args.excluded)) continue
        ctx.add({ courseId: course.id, term: t, status: 'planned' })
        args.reasons.set(reasonKey(course.id, t), [
          {
            kind: 'requirement',
            requirementId: r.requirement.id,
            text: `Counts toward ${r.requirement.name} (${r.requirement.credits} credits required).`,
          },
        ])
        remaining -= course.credits
        break
      }
    }
  }

  // 3. Electives, year by year, to the student's preferred load.
  const startYear = Math.floor(startTerm / 2)
  for (let year = startYear; year < TERM_COUNT / 2; year++) fillYear(year, target)

  // 4. If graduation still needs credits, use the school's maximum load --
  //    and say so, because it's heavier than the student asked for.
  const raisedTerms: TermIndex[] = []
  if (target < max) {
    for (let year = startYear; year < TERM_COUNT / 2; year++) {
      if (allocateRequirements(catalog, ctx.placements).total.remaining <= 0) break
      const before = [ctx.occupancy[year * 2]!, ctx.occupancy[year * 2 + 1]!]
      fillYear(year, max)
      if (ctx.occupancy[year * 2]! > before[0]!) raisedTerms.push(year * 2)
      if (ctx.occupancy[year * 2 + 1]! > before[1]!) raisedTerms.push(year * 2 + 1)
    }
  }

  const shortTerms: FillResult['shortTerms'] = []
  for (let t = startTerm; t < TERM_COUNT; t++) {
    const count = ctx.occupancy[t]!
    if (count >= min) continue
    shortTerms.push({
      term: t,
      count,
      explanation: `Only ${count} courses fit ${termLabel(t)}: no other course in your school's catalog is open to you then without breaking a prerequisite, grade, or season rule.`,
    })
  }
  return { unplaced, shortTerms, raisedTerms }

  function fillYear(year: number, load: number) {
    const fall = year * 2
    const spring = fall + 1
    // While both semesters have room, compare the best full-year elective
    // with the best semester one, so a strong semester course (a fall-only
    // capstone, say) isn't crowded out by a merely available year course.
    for (;;) {
      if (ctx.occupancy[fall]! >= load || ctx.occupancy[spring]! >= load) break
      const yearLong = bestElective(fall, 2)
      const fallSem = bestElective(fall, 1)
      const springSem = bestElective(spring, 1)
      const semBest = Math.max(fallSem ? scoreCourse(fallSem, fall) : -Infinity, springSem ? scoreCourse(springSem, spring) : -Infinity)
      if (yearLong && scoreCourse(yearLong, fall) >= semBest - 0.5) {
        place(yearLong, fall)
      } else if (fallSem || springSem) {
        const pickFall = fallSem && (!springSem || scoreCourse(fallSem, fall) >= scoreCourse(springSem, spring))
        if (pickFall) place(fallSem!, fall)
        else place(springSem!, spring)
      } else {
        break
      }
    }
    for (const term of [fall, spring]) {
      while (ctx.occupancy[term]! < load) {
        const best = bestElective(term, 1)
        if (!best) break
        place(best, term)
      }
    }
    // A full-year course can still close a gap below the minimum when the
    // other semester has room under the maximum.
    if ((ctx.occupancy[fall]! < min || ctx.occupancy[spring]! < min) && ctx.occupancy[fall]! < max && ctx.occupancy[spring]! < max) {
      const best = bestElective(fall, 2)
      if (best) place(best, fall)
    }
  }

  function rank(pool: Course[], from: TermIndex): Course[] {
    return [...pool].sort(
      (a, b) => scoreCourse(b, from) - scoreCourse(a, from) || a.id.localeCompare(b.id),
    )
  }

  function bestElective(term: TermIndex, duration: 1 | 2): Course | null {
    let best: Course | null = null
    let bestScore = -Infinity
    for (const course of catalog.courses.values()) {
      if (course.durationTerms !== duration) continue
      if (infeasibility(ctx, none, course, term, max, args.excluded)) continue
      const s = scoreCourse(course, term)
      if (s > bestScore || (s === bestScore && best && course.id < best.id)) {
        best = course
        bestScore = s
      }
    }
    return best
  }

  function scoreCourse(course: Course, term: TermIndex): number {
    let s = interestScore(model, course) * 3
    s += rigorScore(model, course, 1.5)
    s += workloadScore(model, course, term)
    const year = yearOfTerm(term)
    const interested = interestScore(model, course) > 0
    const sameDepartment = ctx.placements.filter((p) => catalog.courses.get(p.courseId)?.department === course.department)
    const sameDepartmentThisYear = sameDepartment.filter((p) => p.term >= 0 && yearOfTerm(p.term) === year).length
    // Doubling up a core subject in one year should come from real interest.
    const core = catalog.departments.get(course.department)?.lane ?? false
    s -= sameDepartmentThisYear * (core ? 2.5 : 1.2)
    // Breadth: a department the plan hasn't touched is worth a look.
    const electivesInDepartment = sameDepartment.filter((p) => !args.laneCourseIds.has(p.courseId)).length
    if (sameDepartment.length === 0) s += 1
    if (model.explore) s += electivesInDepartment === 0 ? 3 : -2 * electivesInDepartment
    // Don't start a second language (or any second sequence) as a filler.
    if (course.sequence && course.sequence.step === 1) {
      const other = ctx.placements.some((p) => {
        const c = catalog.courses.get(p.courseId)
        return c?.sequence && c.sequence.id !== course.sequence!.id && c.department === course.department
      })
      if (other) s -= 6
    }
    // An intro course after an advanced one in the same department reads backwards.
    if (course.prerequisites.length === 0 && course.grades.includes(9)) {
      const advanced = sameDepartment.some((p) => (catalog.courses.get(p.courseId)?.prerequisites.length ?? 0) > 0)
      if (advanced) s -= 3
    }
    // Ensembles and courses with a recommended background are for students
    // who asked for them.
    if (!interested && ((course.maxEnrollments ?? 1) > 1 || course.notes?.length)) s -= 2
    // Building on an earlier elective makes a path, not a pile.
    const spans = ctx.spans
    const result = evaluatePrerequisites(course, term, spans)
    if (result.groups.some((g) => g.match && !args.laneCourseIds.has(g.match.span.courseId))) s += 2.5
    if (course.prerequisites.length === 0 && interestScore(model, course) > 0) {
      const opens = [...descendants(catalog, course.id)].filter((id) => interestScore(model, catalog.courses.get(id)!) > 0)
      if (opens.length > 0) s += 1
    }
    if (model.targets.has(course.id)) s += 60
    else if ([...model.targets].some((t) => ancestors(catalog, t).has(course.id))) s += 10
    if (model.avoid.has(course.id)) s -= 60
    return s
  }

  function place(course: Course, term: TermIndex) {
    ctx.add({ courseId: course.id, term, status: 'planned' })
    args.reasons.set(reasonKey(course.id, term), electiveReasons(course, term))
  }

  function electiveReasons(course: Course, term: TermIndex): PlacementReason[] {
    const reasons: PlacementReason[] = []
    const goals = matchedGoals(model, course)
    if (goals.length) reasons.push({ kind: 'goal', text: `An elective that fits your interest in ${goals.slice(0, 2).join(' and ')}.` })
    const result = evaluatePrerequisites(course, term, ctx.spans)
    const builds = result.groups.find((g) => g.match && !args.laneCourseIds.has(g.match.span.courseId))
    if (builds?.match) {
      const prev = catalog.courses.get(builds.match.span.courseId)!
      reasons.push({
        kind: 'pathway',
        text: `Builds on ${prev.name} from ${placementPhrase(builds.match.span.start, prev.durationTerms)}.`,
      })
    }
    if (model.targets.has(course.id)) reasons.push({ kind: 'target', text: 'You asked for this course.' })
    if (reasons.length === 0) {
      reasons.push({
        kind: 'fill',
        text: `An elective that completes a ${model.targetLoad}-course semester${
          model.explore ? ' and adds a subject you have not tried yet' : ''
        }.`,
      })
    }
    return reasons
  }
}
