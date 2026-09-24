'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireStudent } from '@/lib/auth/viewer'
import { getDb } from '@/lib/db/client'
import { loadSchool } from '@/lib/db/schools'
import {
  commitVersion,
  createPlan,
  deleteAlternative,
  getLatestVersion,
  getVersion,
  makePrimary,
  PlanConflictError,
  renamePlan,
} from '@/lib/data/plans'
import { getHistory } from '@/lib/data/students'
import { buildCatalog, validatePlan, type Placement } from '@/lib/engine'
import type { PlacementReason } from '@/lib/engine/generate/lanes'

const placementsSchema = z.array(z.object({ courseId: z.string().min(1).max(80), term: z.number().int().min(0).max(7) })).max(64)

const reasonSchema = z.object({
  kind: z.enum(['history', 'pinned', 'requirement', 'pathway', 'policy', 'every-term', 'goal', 'target', 'rigor', 'fill']),
  text: z.string().max(240),
})

const commitSchema = z.object({
  planId: z.uuid(),
  baseVersion: z.number().int().min(1),
  placements: placementsSchema,
  summary: z.string().trim().min(1).max(200),
  change: z.record(z.string(), z.unknown()).default({}),
  reasons: z.record(z.string().max(100), z.array(reasonSchema).max(4)).default({}),
})

export type CommitResult =
  | { ok: true; version: number; validationStatus: string }
  | { ok: false; conflict?: boolean; error: string }

/**
 * Saves a new version of a plan. The engine re-validates on the server:
 * the status stored is computed here, never taken from the browser.
 */
export async function commitPlanAction(raw: z.input<typeof commitSchema>): Promise<CommitResult> {
  const viewer = await requireStudent()
  const parsed = commitSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That change could not be read. Your plan was not modified.' }
  const input = parsed.data
  const db = await getDb()
  const student = viewer.student
  const school = student.schoolId ? await loadSchool(db, student.schoolId) : null
  if (!school) return { ok: false, error: 'Your school’s catalog is unavailable. Your plan was not modified.' }
  const catalog = buildCatalog(school)
  const startTerm = student.startTerm ?? 0
  if (input.placements.some((p) => !catalog.courses.has(p.courseId) || p.term < startTerm)) {
    return { ok: false, error: 'That change includes a course or term Compass doesn’t recognize. Your plan was not modified.' }
  }
  const planned: Placement[] = input.placements.map((p) => ({ ...p, status: 'planned' }))
  const history = await getHistory(db, student.id)
  const validation = validatePlan(catalog, { startTerm }, { placements: [...history, ...planned] }, student.preferences)
  const keys = new Set(planned.map((p) => `${p.courseId}@${p.term}`))
  const reasons = Object.fromEntries(Object.entries(input.reasons).filter(([k]) => keys.has(k)))
  try {
    const saved = await commitVersion(db, student.id, input.planId, input.baseVersion, {
      summary: input.summary,
      change: input.change,
      validationStatus: validation.status,
      reasons,
      placements: planned,
    })
    return { ok: true, version: saved.version, validationStatus: validation.status }
  } catch (err) {
    if (err instanceof PlanConflictError) return { ok: false, conflict: true, error: err.message }
    console.error('commitPlanAction failed', err)
    return { ok: false, error: 'Compass couldn’t save this change right now. Your existing plan has not been modified.' }
  }
}

export interface VersionPayload {
  version: number
  summary: string
  placements: Placement[]
  reasons: Record<string, PlacementReason[]>
}

export async function getVersionAction(versionId: string): Promise<VersionPayload | null> {
  const viewer = await requireStudent()
  if (!z.uuid().safeParse(versionId).success) return null
  const db = await getDb()
  const v = await getVersion(db, viewer.student.id, versionId)
  if (!v) return null
  return { version: v.version, summary: v.summary, placements: v.placements, reasons: v.reasons as Record<string, PlacementReason[]> }
}

/** Restoring never rewrites history: it appends a copy of the old version. */
export async function restoreVersionAction(input: { planId: string; versionId: string; baseVersion: number }): Promise<CommitResult & { placements?: Placement[]; reasons?: Record<string, PlacementReason[]> }> {
  const viewer = await requireStudent()
  const db = await getDb()
  const old = await getVersion(db, viewer.student.id, input.versionId)
  if (!old || old.planId !== input.planId) return { ok: false, error: 'That version is not available.' }
  const result = await commitPlanAction({
    planId: input.planId,
    baseVersion: input.baseVersion,
    placements: old.placements.map((p) => ({ courseId: p.courseId, term: p.term })),
    summary: `Restored version ${old.version}`,
    change: { kind: 'restore', fromVersion: old.version },
    reasons: old.reasons as Record<string, PlacementReason[]>,
  })
  return result.ok ? { ...result, placements: old.placements, reasons: old.reasons as Record<string, PlacementReason[]> } : result
}

export async function duplicatePlanAction(input: { planId: string; name: string }): Promise<{ ok: false; error: string } | never> {
  const viewer = await requireStudent()
  const db = await getDb()
  const latest = await getLatestVersion(db, viewer.student.id, input.planId)
  if (!latest) return { ok: false, error: 'That plan is not available.' }
  const name = input.name.trim().slice(0, 60) || 'Alternative plan'
  const { planId } = await createPlan(
    db,
    viewer.student.id,
    { name, kind: 'alternative' },
    {
      summary: `Copied from version ${latest.version}`,
      change: { kind: 'duplicate', fromPlan: input.planId, fromVersion: latest.version },
      validationStatus: latest.validationStatus,
      reasons: latest.reasons,
      placements: latest.placements,
    },
  )
  redirect(`/plan?plan=${planId}`)
}

export async function makePrimaryAction(planId: string): Promise<void> {
  const viewer = await requireStudent()
  const db = await getDb()
  await makePrimary(db, viewer.student.id, planId)
  redirect(`/plan?plan=${planId}`)
}

export async function deletePlanAction(planId: string): Promise<void> {
  const viewer = await requireStudent()
  const db = await getDb()
  await deleteAlternative(db, viewer.student.id, planId)
  redirect('/plan')
}

export async function renamePlanAction(input: { planId: string; name: string }): Promise<{ ok: boolean }> {
  const viewer = await requireStudent()
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false }
  const db = await getDb()
  return { ok: await renamePlan(db, viewer.student.id, input.planId, name) }
}
