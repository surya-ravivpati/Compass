import type { Course, Department, Requirement, SchoolConfig } from './types.ts'

/**
 * A school configuration indexed for fast lookup. Built once per catalog; it
 * holds only plain maps, so client code can build its own copy from the same
 * serialised `SchoolConfig` the server used.
 */
export interface Catalog {
  school: SchoolConfig
  courses: Map<string, Course>
  requirements: Map<string, Requirement>
  departments: Map<string, Department>
  /** course id -> ids of courses that list it as a prerequisite option. */
  dependents: Map<string, string[]>
  /** equivalence group -> course ids. */
  equivalents: Map<string, string[]>
  /** sequence id -> course ids ordered by step. */
  sequences: Map<string, string[]>
}

export function buildCatalog(school: SchoolConfig): Catalog {
  const courses = new Map<string, Course>()
  for (const course of school.courses) courses.set(course.id, course)

  const dependents = new Map<string, string[]>()
  for (const course of school.courses) {
    for (const group of course.prerequisites) {
      for (const option of group.anyOf) {
        const list = dependents.get(option.courseId) ?? []
        if (!list.includes(course.id)) list.push(course.id)
        dependents.set(option.courseId, list)
      }
    }
  }
  for (const list of dependents.values()) list.sort()

  const equivalents = new Map<string, string[]>()
  const sequences = new Map<string, string[]>()
  for (const course of school.courses) {
    if (course.equivalenceGroup) {
      const list = equivalents.get(course.equivalenceGroup) ?? []
      list.push(course.id)
      equivalents.set(course.equivalenceGroup, list)
    }
    if (course.sequence) {
      const list = sequences.get(course.sequence.id) ?? []
      list.push(course.id)
      sequences.set(course.sequence.id, list)
    }
  }
  for (const list of equivalents.values()) list.sort()
  for (const list of sequences.values()) {
    list.sort((a, b) => (courses.get(a)!.sequence!.step - courses.get(b)!.sequence!.step) || a.localeCompare(b))
  }

  return {
    school,
    courses,
    requirements: new Map(school.requirements.map((r) => [r.id, r])),
    departments: new Map(school.departments.map((d) => [d.id, d])),
    dependents,
    equivalents,
    sequences,
  }
}

export function getCourse(catalog: Catalog, id: string): Course {
  const course = catalog.courses.get(id)
  if (!course) throw new Error(`Unknown course "${id}"`)
  return course
}

export function courseName(catalog: Catalog, id: string): string {
  return catalog.courses.get(id)?.name ?? id
}

export interface CatalogIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

/**
 * Checks a school configuration before anything plans against it. Errors
 * make the catalog unusable; warnings are worth a human look.
 */
export function validateCatalog(school: SchoolConfig): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  const error = (path: string, message: string) => issues.push({ severity: 'error', path, message })
  const warn = (path: string, message: string) => issues.push({ severity: 'warning', path, message })

  const courseIds = new Set<string>()
  for (const course of school.courses) {
    if (courseIds.has(course.id)) error(`courses.${course.id}`, `Duplicate course id "${course.id}".`)
    courseIds.add(course.id)
  }
  const requirementIds = new Set(school.requirements.map((r) => r.id))
  const departmentIds = new Set(school.departments.map((d) => d.id))

  if (school.load.min < 1 || school.load.max < school.load.min) {
    error('load', `Course load must satisfy 1 <= min <= max (got ${school.load.min}-${school.load.max}).`)
  }

  for (const course of school.courses) {
    const at = `courses.${course.id}`
    if (!course.name.trim()) error(at, 'Course has no name.')
    if (!departmentIds.has(course.department)) error(at, `Unknown department "${course.department}".`)
    if (!(course.credits > 0)) error(at, 'Credits must be greater than zero.')
    if (course.durationTerms !== 1 && course.durationTerms !== 2) {
      error(at, 'durationTerms must be 1 (semester) or 2 (full year).')
    }
    if (course.grades.length === 0) error(at, 'Course is open to no grade.')
    if (course.grades.some((g) => g < 9 || g > 12)) error(at, 'Grades must be between 9 and 12.')
    if (course.seasons.length === 0) error(at, 'Course has no starting season.')
    if (course.durationTerms === 2 && (course.seasons.length !== 1 || course.seasons[0] !== 'fall')) {
      error(at, 'A full-year course must start in the fall only.')
    }
    course.prerequisites.forEach((group, gi) => {
      if (group.anyOf.length === 0) error(`${at}.prerequisites[${gi}]`, 'Empty prerequisite group.')
      for (const option of group.anyOf) {
        if (option.courseId === course.id) error(`${at}.prerequisites[${gi}]`, 'A course cannot require itself.')
        else if (!courseIds.has(option.courseId)) {
          error(`${at}.prerequisites[${gi}]`, `Prerequisite "${option.courseId}" is not in the catalog.`)
        }
      }
    })
    for (const req of course.satisfies) {
      if (!requirementIds.has(req)) error(at, `Satisfies unknown requirement "${req}".`)
    }
    for (const [req, grade] of Object.entries(course.satisfiesFromGrade ?? {})) {
      if (!course.satisfies.includes(req)) error(at, `satisfiesFromGrade names "${req}", which the course doesn't satisfy.`)
      if (grade !== undefined && !course.grades.includes(grade) && !course.grades.some((g) => g > grade)) {
        error(at, `satisfiesFromGrade: the course is never taken in grade ${grade} or later.`)
      }
    }
    if (course.maxEnrollments !== undefined && course.maxEnrollments < 1) {
      error(at, 'maxEnrollments must be at least 1.')
    }
  }

  const cycle = findPrerequisiteCycle(school.courses)
  if (cycle) {
    error('courses', `Prerequisite cycle: ${cycle.join(' → ')}. A course cannot depend on itself.`)
  }

  const electives = school.requirements.filter((r) => r.kind === 'elective')
  if (electives.length > 1) error('requirements', 'At most one elective requirement is allowed.')
  for (const req of school.requirements) {
    const at = `requirements.${req.id}`
    if (!(req.credits > 0)) error(at, 'Required credits must be greater than zero.')
    for (const group of req.mustInclude ?? []) {
      if (group.anyOf.length === 0) error(at, `Must-include group "${group.label}" lists no courses.`)
      for (const id of group.anyOf) {
        if (!courseIds.has(id)) error(at, `Must-include course "${id}" is not in the catalog.`)
        else if (!school.courses.find((c) => c.id === id)!.satisfies.includes(req.id)) {
          error(at, `Must-include course "${id}" does not list "${req.id}" in satisfies.`)
        }
      }
    }
    if (req.kind === 'category' && !school.courses.some((c) => c.satisfies.includes(req.id))) {
      error(at, 'No course satisfies this requirement.')
    }
  }
  const categorySum = school.requirements.reduce((sum, r) => sum + r.credits, 0)
  if (categorySum > school.totalCredits) {
    warn('totalCredits', `Requirements add up to ${categorySum} credits, more than the ${school.totalCredits} total.`)
  }

  for (const policy of school.policies) {
    const at = `policies.${policy.id}`
    if (policy.kind === 'every-term' && !departmentIds.has(policy.department)) {
      error(at, `Unknown department "${policy.department}".`)
    }
    if (policy.kind === 'every-term') {
      for (const id of policy.alsoCounts ?? []) if (!courseIds.has(id)) error(at, `Unknown course "${id}".`)
    }
    if (policy.kind === 'placement') {
      for (const id of policy.courseIds) if (!courseIds.has(id)) error(at, `Unknown course "${id}".`)
    }
  }

  const steps = new Map<string, Set<number>>()
  for (const course of school.courses) {
    if (!course.sequence) continue
    const seen = steps.get(course.sequence.id) ?? new Set<number>()
    if (seen.has(course.sequence.step) && !course.equivalenceGroup) {
      warn(`courses.${course.id}`, `Sequence "${course.sequence.id}" has two courses at step ${course.sequence.step}.`)
    }
    seen.add(course.sequence.step)
    steps.set(course.sequence.id, seen)
  }

  return issues
}

/**
 * Returns one prerequisite cycle as a path of course names that starts and
 * ends on the same course, or null for an acyclic catalog.
 */
export function findPrerequisiteCycle(courses: Course[]): string[] | null {
  const byId = new Map(courses.map((c) => [c.id, c]))
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (id: string): string[] | null => {
    const mark = state.get(id)
    if (mark === 'done') return null
    if (mark === 'visiting') {
      const start = stack.indexOf(id)
      return [...stack.slice(start), id].map((cid) => byId.get(cid)?.name ?? cid)
    }
    const course = byId.get(id)
    if (!course) return null
    state.set(id, 'visiting')
    stack.push(id)
    const ids = [...new Set(course.prerequisites.flatMap((g) => g.anyOf.map((o) => o.courseId)))].sort()
    for (const next of ids) {
      const found = visit(next)
      if (found) return found
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }

  for (const course of [...courses].sort((a, b) => a.id.localeCompare(b.id))) {
    const found = visit(course.id)
    if (found) return found
  }
  return null
}
