import { asc, eq } from 'drizzle-orm'
import type { Course, GradeLevel, Level, PrereqGroup, Requirement, SchoolConfig, Season, Workload } from '../engine/types.ts'
import type { Database } from './client.ts'
import { courses, prerequisites, requirements, schools } from './schema.ts'

export interface SchoolSummary {
  id: string
  name: string
  isDemo: boolean
}

export async function listSchools(db: Database): Promise<SchoolSummary[]> {
  return db.select({ id: schools.id, name: schools.name, isDemo: schools.isDemo }).from(schools).orderBy(asc(schools.name))
}

const cache = new Map<string, { version: string; school: SchoolConfig }>()

/**
 * Rebuilds a school's configuration from its tables. Cached per catalog
 * version: reference data changes only when an admin re-seeds it.
 */
export async function loadSchool(db: Database, schoolId: string): Promise<SchoolConfig | null> {
  const [row] = await db.select().from(schools).where(eq(schools.id, schoolId))
  if (!row) return null
  const cached = cache.get(schoolId)
  if (cached && cached.version === row.catalogVersion) return cached.school

  const [courseRows, edgeRows, requirementRows] = await Promise.all([
    db.select().from(courses).where(eq(courses.schoolId, schoolId)).orderBy(asc(courses.sortOrder)),
    db.select().from(prerequisites).where(eq(prerequisites.schoolId, schoolId)),
    db.select().from(requirements).where(eq(requirements.schoolId, schoolId)).orderBy(asc(requirements.sortOrder)),
  ])

  const groupsByCourse = new Map<string, Map<number, PrereqGroup>>()
  for (const e of edgeRows.sort((a, b) => a.groupIndex - b.groupIndex || a.optionIndex - b.optionIndex)) {
    const groups = groupsByCourse.get(e.courseId) ?? new Map<number, PrereqGroup>()
    const group = groups.get(e.groupIndex) ?? { anyOf: [], ...(e.note ? { note: e.note } : {}) }
    group.anyOf.push({ courseId: e.prerequisiteCourseId, timing: e.timing as PrereqGroup['anyOf'][number]['timing'] })
    groups.set(e.groupIndex, group)
    groupsByCourse.set(e.courseId, groups)
  }

  const courseList: Course[] = courseRows.map((c) => ({
    id: c.id,
    ...(c.code ? { code: c.code } : {}),
    name: c.name,
    department: c.department,
    description: c.description,
    credits: c.credits,
    durationTerms: c.durationTerms as 1 | 2,
    grades: c.grades as GradeLevel[],
    seasons: c.seasons as Season[],
    prerequisites: [...(groupsByCourse.get(c.id)?.entries() ?? [])].sort((a, b) => a[0] - b[0]).map(([, g]) => g),
    level: c.level as Level,
    workload: c.workload as Workload,
    ...(c.workloadEstimated ? { workloadEstimated: true } : {}),
    ...(c.lab ? { lab: true } : {}),
    tags: c.tags,
    satisfies: c.satisfies,
    ...(c.sequenceId && c.sequenceStep !== null ? { sequence: { id: c.sequenceId, step: c.sequenceStep } } : {}),
    ...(c.equivalenceGroup ? { equivalenceGroup: c.equivalenceGroup } : {}),
    ...(c.maxEnrollments ? { maxEnrollments: c.maxEnrollments } : {}),
    ...(c.satisfiesFromGrade ? { satisfiesFromGrade: c.satisfiesFromGrade } : {}),
    ...(c.byPlacement ? { byPlacement: true } : {}),
    ...(c.notes?.length ? { notes: c.notes } : {}),
    source: c.source,
  }))

  const requirementList: Requirement[] = requirementRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    credits: r.credits,
    kind: r.kind as Requirement['kind'],
    ...(r.sameSequence ? { sameSequence: true } : {}),
    ...(r.mustInclude ? { mustInclude: r.mustInclude } : {}),
    source: r.source,
  }))

  const school: SchoolConfig = {
    id: row.id,
    name: row.name,
    isDemo: row.isDemo,
    load: row.settings.load,
    totalCredits: row.settings.totalCredits,
    preHighSchoolCredit: row.settings.preHighSchoolCredit,
    departments: row.settings.departments,
    requirements: requirementList,
    policies: row.settings.policies,
    courses: courseList,
    mathPlacement: row.settings.mathPlacement,
    source: row.source,
  }
  cache.set(schoolId, { version: row.catalogVersion, school })
  return school
}
