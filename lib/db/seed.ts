import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { DEMO_SCHOOL } from '../catalog/demo-school.ts'
import { validateCatalog } from '../engine/catalog.ts'
import type { SchoolConfig } from '../engine/types.ts'
import type { Database } from './client.ts'
import { courses, prerequisites, requirements, schools } from './schema.ts'

/** Content hash of a catalog, so caches refresh exactly when it changes. */
export function catalogVersion(school: SchoolConfig): string {
  return createHash('sha256').update(JSON.stringify(school)).digest('hex').slice(0, 16)
}

/**
 * Replaces one school's reference data. Refuses a catalog with validation
 * errors: a broken catalog must never reach a student's plan.
 */
export async function seedSchool(db: Database, school: SchoolConfig): Promise<void> {
  const errors = validateCatalog(school).filter((i) => i.severity === 'error')
  if (errors.length) {
    throw new Error(`Catalog "${school.id}" is invalid:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`)
  }
  const version = catalogVersion(school)
  await db.transaction(async (tx) => {
    const settings = {
      load: school.load,
      totalCredits: school.totalCredits,
      preHighSchoolCredit: school.preHighSchoolCredit,
      departments: school.departments,
      policies: school.policies,
      mathPlacement: school.mathPlacement,
    }
    await tx
      .insert(schools)
      .values({ id: school.id, name: school.name, isDemo: school.isDemo, settings, source: school.source, catalogVersion: version })
      .onConflictDoUpdate({
        target: schools.id,
        set: { name: school.name, isDemo: school.isDemo, settings, source: school.source, catalogVersion: version, updatedAt: sql`now()` },
      })
    await tx.delete(prerequisites).where(eq(prerequisites.schoolId, school.id))
    await tx.delete(courses).where(eq(courses.schoolId, school.id))
    await tx.delete(requirements).where(eq(requirements.schoolId, school.id))
    await tx.insert(courses).values(
      school.courses.map((c, i) => ({
        schoolId: school.id,
        id: c.id,
        code: c.code ?? null,
        name: c.name,
        department: c.department,
        description: c.description,
        credits: c.credits,
        durationTerms: c.durationTerms,
        grades: c.grades,
        seasons: c.seasons,
        level: c.level,
        workload: c.workload,
        lab: c.lab ?? false,
        tags: c.tags,
        satisfies: c.satisfies,
        sequenceId: c.sequence?.id ?? null,
        sequenceStep: c.sequence?.step ?? null,
        equivalenceGroup: c.equivalenceGroup ?? null,
        maxEnrollments: c.maxEnrollments ?? null,
        notes: c.notes ?? null,
        source: c.source,
        sortOrder: i,
      })),
    )
    const edges = school.courses.flatMap((c) =>
      c.prerequisites.flatMap((group, groupIndex) =>
        group.anyOf.map((o, optionIndex) => ({
          schoolId: school.id,
          courseId: c.id,
          groupIndex,
          optionIndex,
          prerequisiteCourseId: o.courseId,
          timing: o.timing,
          note: group.note ?? null,
        })),
      ),
    )
    if (edges.length) await tx.insert(prerequisites).values(edges)
    await tx.insert(requirements).values(
      school.requirements.map((r, i) => ({
        schoolId: school.id,
        id: r.id,
        name: r.name,
        description: r.description,
        credits: r.credits,
        kind: r.kind,
        sameSequence: r.sameSequence ?? false,
        mustInclude: r.mustInclude ?? null,
        sortOrder: i,
        source: r.source,
      })),
    )
  })
}

/** Seeds the demo school when no school exists yet (local development). */
export async function seedIfEmpty(db: Database): Promise<void> {
  const existing = await db.select({ id: schools.id, version: schools.catalogVersion }).from(schools)
  const demo = existing.find((s) => s.id === DEMO_SCHOOL.id)
  if (existing.length === 0 || (demo && demo.version !== catalogVersion(DEMO_SCHOOL))) {
    await seedSchool(db, DEMO_SCHOOL)
  }
}

export const SEED_SCHOOLS: SchoolConfig[] = [DEMO_SCHOOL]
