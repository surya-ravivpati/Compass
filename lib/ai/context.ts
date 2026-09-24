import 'server-only'
import { eq } from 'drizzle-orm'
import type { Viewer } from '../auth/viewer.ts'
import type { Database } from '../db/client.ts'
import { schools } from '../db/schema.ts'
import { loadSchool } from '../db/schools.ts'
import { getLatestVersion, getPrimaryPlanId, listPlans } from '../data/plans.ts'
import { getHistory } from '../data/students.ts'
import { buildCatalog, type PlacementReason } from '../engine/index.ts'
import type { StudentContext } from './prompts.ts'
import type { ToolContext } from './tools.ts'

/** Compass AI's context: only the signed-in student's own plan and their school's catalog. */
export async function assistantContext(
  db: Database,
  viewer: Viewer,
  planId?: string,
): Promise<{ tools: ToolContext; student: StudentContext; catalogVersion: string } | null> {
  const s = viewer.student
  if (!s.schoolId) return null
  const school = await loadSchool(db, s.schoolId)
  if (!school) return null
  const [row] = await db.select({ version: schools.catalogVersion }).from(schools).where(eq(schools.id, s.schoolId))
  const plans = await listPlans(db, s.id)
  const chosen = (planId && plans.find((p) => p.id === planId)?.id) || (await getPrimaryPlanId(db, s.id))
  if (!chosen) return null
  const [history, latest] = await Promise.all([getHistory(db, s.id), getLatestVersion(db, s.id, chosen)])
  if (!latest) return null
  return {
    tools: {
      catalog: buildCatalog(school),
      student: { startTerm: s.startTerm ?? 0 },
      placements: [...history, ...latest.placements],
      preferences: s.preferences,
      reasons: latest.reasons as Record<string, PlacementReason[]>,
    },
    student: {
      firstName: s.firstName,
      grade: s.grade,
      graduationYear: s.graduationYear,
      schoolName: school.name,
      isDemoCatalog: school.isDemo,
      preferences: s.preferences,
    },
    catalogVersion: row?.version ?? 'unknown',
  }
}
