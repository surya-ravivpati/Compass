import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Placement } from '../engine/types.ts'
import type { Database } from '../db/client.ts'
import { planCourses, plans, planVersions } from '../db/schema.ts'

/*
 * Every function here takes the student id from the caller's verified session
 * and filters by it. A plan or version id alone never grants access.
 */

export interface PlanSummary {
  id: string
  name: string
  kind: 'primary' | 'alternative'
  latestVersion: number
  validationStatus: string
  updatedAt: Date
}

export interface VersionRecord {
  id: string
  planId: string
  version: number
  summary: string
  change: Record<string, unknown>
  validationStatus: string
  reasons: Record<string, unknown>
  createdAt: Date
  /** Planned placements only; history comes from the student record. */
  placements: Placement[]
}

export interface NewVersion {
  summary: string
  change: Record<string, unknown>
  validationStatus: string
  reasons?: Record<string, unknown>
  /** Planned placements only. */
  placements: Placement[]
}

export class PlanConflictError extends Error {
  readonly latest: number
  constructor(latest: number) {
    super('This plan changed somewhere else (another tab or device). Reload to see the latest version.')
    this.latest = latest
  }
}

export async function listPlans(db: Database, studentId: string): Promise<PlanSummary[]> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      kind: plans.kind,
      updatedAt: plans.updatedAt,
      latestVersion: sql<number>`coalesce(max(${planVersions.version}), 0)`.mapWith(Number),
      validationStatus: sql<string>`(array_agg(${planVersions.validationStatus} order by ${planVersions.version} desc))[1]`,
    })
    .from(plans)
    .leftJoin(planVersions, eq(planVersions.planId, plans.id))
    .where(eq(plans.studentId, studentId))
    .groupBy(plans.id)
    .orderBy(sql`case when ${plans.kind} = 'primary' then 0 else 1 end`, asc(plans.createdAt))
  return rows.map((r) => ({ ...r, kind: r.kind as PlanSummary['kind'], validationStatus: r.validationStatus ?? 'valid' }))
}

async function ownedPlan(db: Database, studentId: string, planId: string) {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
  return row ?? null
}

export async function getPrimaryPlanId(db: Database, studentId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.studentId, studentId), eq(plans.kind, 'primary')))
  return row?.id ?? null
}

async function loadVersion(db: Database, row: typeof planVersions.$inferSelect): Promise<VersionRecord> {
  const courses = await db
    .select({ courseId: planCourses.courseId, term: planCourses.term })
    .from(planCourses)
    .where(eq(planCourses.versionId, row.id))
  return {
    id: row.id,
    planId: row.planId,
    version: row.version,
    summary: row.summary,
    change: row.change,
    validationStatus: row.validationStatus,
    reasons: row.reasons,
    createdAt: row.createdAt,
    placements: courses
      .map((c) => ({ courseId: c.courseId, term: c.term, status: 'planned' as const }))
      .sort((a, b) => a.term - b.term || a.courseId.localeCompare(b.courseId)),
  }
}

export async function getLatestVersion(db: Database, studentId: string, planId: string): Promise<VersionRecord | null> {
  if (!(await ownedPlan(db, studentId, planId))) return null
  const [row] = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.planId, planId))
    .orderBy(desc(planVersions.version))
    .limit(1)
  return row ? loadVersion(db, row) : null
}

export async function getVersion(db: Database, studentId: string, versionId: string): Promise<VersionRecord | null> {
  const [row] = await db
    .select({ version: planVersions })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(and(eq(planVersions.id, versionId), eq(plans.studentId, studentId)))
  return row ? loadVersion(db, row.version) : null
}

export async function listVersions(
  db: Database,
  studentId: string,
  planId: string,
): Promise<Omit<VersionRecord, 'placements' | 'reasons'>[]> {
  if (!(await ownedPlan(db, studentId, planId))) return []
  const rows = await db.select().from(planVersions).where(eq(planVersions.planId, planId)).orderBy(desc(planVersions.version))
  return rows.map(({ reasons: _reasons, ...r }) => r)
}

export async function createPlan(
  db: Database,
  studentId: string,
  plan: { name: string; kind: 'primary' | 'alternative' },
  first: NewVersion,
): Promise<{ planId: string; versionId: string }> {
  return db.transaction(async (tx) => {
    if (plan.kind === 'primary') {
      await tx.update(plans).set({ kind: 'alternative' }).where(and(eq(plans.studentId, studentId), eq(plans.kind, 'primary')))
    }
    const [created] = await tx.insert(plans).values({ studentId, name: plan.name, kind: plan.kind }).returning({ id: plans.id })
    const versionId = await insertVersion(tx as unknown as Database, created!.id, 1, first)
    return { planId: created!.id, versionId }
  })
}

/**
 * Appends a version. `baseVersion` is the version the student was looking at;
 * if the plan has moved on since, nothing is written and the caller reloads.
 */
export async function commitVersion(
  db: Database,
  studentId: string,
  planId: string,
  baseVersion: number,
  next: NewVersion,
): Promise<{ versionId: string; version: number }> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
      .for('update')
    if (!owned) throw new Error('Plan not found.')
    const [latest] = await tx
      .select({ version: sql<number>`coalesce(max(${planVersions.version}), 0)`.mapWith(Number) })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
    const current = latest?.version ?? 0
    if (current !== baseVersion) throw new PlanConflictError(current)
    const versionId = await insertVersion(tx as unknown as Database, planId, current + 1, next)
    await tx.update(plans).set({ updatedAt: sql`now()` }).where(eq(plans.id, planId))
    return { versionId, version: current + 1 }
  })
}

async function insertVersion(db: Database, planId: string, version: number, v: NewVersion): Promise<string> {
  const [row] = await db
    .insert(planVersions)
    .values({
      planId,
      version,
      summary: v.summary,
      change: v.change,
      validationStatus: v.validationStatus,
      reasons: v.reasons ?? {},
    })
    .returning({ id: planVersions.id })
  const planned = v.placements.filter((p) => p.status === 'planned')
  if (planned.length) {
    await db.insert(planCourses).values(planned.map((p) => ({ versionId: row!.id, courseId: p.courseId, term: p.term })))
  }
  return row!.id
}

export async function renamePlan(db: Database, studentId: string, planId: string, name: string): Promise<boolean> {
  const updated = await db
    .update(plans)
    .set({ name, updatedAt: sql`now()` })
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
    .returning({ id: plans.id })
  return updated.length > 0
}

/** Makes an alternative the primary plan; the old primary becomes an alternative. */
export async function makePrimary(db: Database, studentId: string, planId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: plans.id }).from(plans).where(and(eq(plans.id, planId), eq(plans.studentId, studentId)))
    if (!owned) return false
    await tx.update(plans).set({ kind: 'alternative' }).where(and(eq(plans.studentId, studentId), eq(plans.kind, 'primary')))
    await tx.update(plans).set({ kind: 'primary', updatedAt: sql`now()` }).where(eq(plans.id, planId))
    return true
  })
}

/** Deletes an alternative plan. The primary plan can't be deleted. */
export async function deleteAlternative(db: Database, studentId: string, planId: string): Promise<boolean> {
  const deleted = await db
    .delete(plans)
    .where(and(eq(plans.id, planId), eq(plans.studentId, studentId), eq(plans.kind, 'alternative')))
    .returning({ id: plans.id })
  return deleted.length > 0
}
