import type { Catalog } from './catalog.ts'
import type { MustIncludeResult, RequirementStatus } from './requirements.ts'
import {
  BEFORE_HIGH_SCHOOL,
  type Course,
  type GoalId,
  type Placement,
  type PlacementStatus,
  type Program,
  type ProgramRequirement,
  type TermIndex,
} from './types.ts'

export interface ProgramCourse {
  courseId: string
  term: TermIndex
  status: PlacementStatus
  credits: number
}

export interface ProgramRequirementProgress {
  requirement: ProgramRequirement
  required: number
  completed: number
  inProgress: number
  planned: number
  remaining: number
  /** As for graduation: `complete` only from finished coursework. */
  status: RequirementStatus
  mustInclude: MustIncludeResult[]
  courses: ProgramCourse[]
}

export interface ProgramProgress {
  program: Program
  requirements: ProgramRequirementProgress[]
  /** Whether the plan, finished work and planned work together, covers it all. */
  covered: boolean
}

/** Whether a course counts toward one part of a program. */
export function countsTowardProgram(course: Course, requirement: ProgramRequirement): boolean {
  return (
    (requirement.counts.departments?.includes(course.department) ?? false) ||
    (requirement.counts.requirements?.some((id) => course.satisfies.includes(id)) ?? false)
  )
}

/** The school's programs a student's goals ask the planner to aim for. */
export function programsFor(catalog: Catalog, goals: GoalId[]): Program[] {
  return (catalog.school.programs ?? []).filter((p) => goals.includes(p.goal))
}

/**
 * How a plan measures up to a program. A course counts toward the first part
 * of the program it fits, once; finished work counts before work in progress,
 * and that before planned work. Courses finished before high school cover a
 * named course but earn credit only where the school grants it.
 */
export function programProgress(catalog: Catalog, placements: Placement[], program: Program): ProgramProgress {
  const rank: Record<PlacementStatus, number> = { completed: 0, 'in-progress': 1, planned: 2 }
  const ordered = [...placements].sort((a, b) => rank[a.status] - rank[b.status] || a.term - b.term || a.courseId.localeCompare(b.courseId))
  const used = new Set<Placement>()
  const requirements = program.requirements.map((requirement): ProgramRequirementProgress => {
    const courses: ProgramCourse[] = []
    const totals = { completed: 0, 'in-progress': 0, planned: 0 }
    let counted = 0
    for (const p of ordered) {
      const course = catalog.courses.get(p.courseId)
      if (!course || used.has(p) || !countsTowardProgram(course, requirement)) continue
      const earlier = p.term === BEFORE_HIGH_SCHOOL
      if (earlier && !catalog.school.preHighSchoolCredit) continue
      if (counted >= requirement.credits) break
      const credits = Math.min(course.credits, requirement.credits - counted)
      used.add(p)
      counted += credits
      totals[p.status] += credits
      courses.push({ courseId: p.courseId, term: p.term, status: p.status, credits })
    }
    const mustInclude = (requirement.mustInclude ?? []).map((group): MustIncludeResult => {
      const hit = ordered.find((p) => group.anyOf.includes(p.courseId))
      return { group, satisfiedBy: hit ? { courseId: hit.courseId, term: hit.term, status: hit.status } : null }
    })
    const done = (statuses: PlacementStatus[]) =>
      mustInclude.every((m) => m.satisfiedBy && statuses.includes(m.satisfiedBy.status))
    const status: RequirementStatus =
      totals.completed >= requirement.credits && done(['completed'])
        ? 'complete'
        : totals.completed + totals['in-progress'] >= requirement.credits && done(['completed', 'in-progress'])
          ? 'in-progress'
          : counted >= requirement.credits && done(['completed', 'in-progress', 'planned'])
            ? 'on-track'
            : 'missing'
    return {
      requirement,
      required: requirement.credits,
      completed: totals.completed,
      inProgress: totals['in-progress'],
      planned: totals.planned,
      remaining: Math.max(0, requirement.credits - counted),
      status,
      mustInclude,
      courses,
    }
  })
  return { program, requirements, covered: requirements.every((r) => r.status !== 'missing') }
}
