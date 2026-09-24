'use server'

import { z } from 'zod'
import { requireStudent } from '@/lib/auth/viewer'
import { getDb } from '@/lib/db/client'
import { loadSchool } from '@/lib/db/schools'
import { createPlan } from '@/lib/data/plans'
import { getHistory } from '@/lib/data/students'
import { buildCatalog, validatePlan, type Placement } from '@/lib/engine'

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  placements: z.array(z.object({ courseId: z.string().min(1).max(80), term: z.number().int().min(0).max(7) })).max(64),
  scenario: z.record(z.string(), z.unknown()).default({}),
})

/** Saves a what-if result as a separate alternative plan; the primary plan is untouched. */
export async function saveScenarioAction(raw: z.input<typeof schema>): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const viewer = await requireStudent()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That scenario could not be saved.' }
  const db = await getDb()
  const student = viewer.student
  const school = student.schoolId ? await loadSchool(db, student.schoolId) : null
  if (!school) return { ok: false, error: 'Your school’s catalog is unavailable.' }
  const catalog = buildCatalog(school)
  const startTerm = student.startTerm ?? 0
  if (parsed.data.placements.some((p) => !catalog.courses.has(p.courseId) || p.term < startTerm)) {
    return { ok: false, error: 'That scenario includes a course or term Compass doesn’t recognize.' }
  }
  const planned: Placement[] = parsed.data.placements.map((p) => ({ ...p, status: 'planned' }))
  const history = await getHistory(db, student.id)
  const validation = validatePlan(catalog, { startTerm }, { placements: [...history, ...planned] }, student.preferences)
  const { planId } = await createPlan(
    db,
    student.id,
    { name: parsed.data.name, kind: 'alternative' },
    { summary: `Saved from What If: ${parsed.data.name}`, change: { kind: 'what-if', scenario: parsed.data.scenario }, validationStatus: validation.status, placements: planned },
  )
  return { ok: true, planId }
}
