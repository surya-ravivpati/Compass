import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { requireStudent, type Viewer } from './auth/viewer.ts'
import { getDb } from './db/client.ts'
import { loadSchool } from './db/schools.ts'
import { getLatestVersion, getPrimaryPlanId, listPlans, type PlanSummary } from './data/plans.ts'
import { getHistory } from './data/students.ts'
import { isAiConfigured } from './ai/config.ts'
import type { PlacementReason } from './engine/generate/lanes.ts'
import type { Placement, SchoolConfig } from './engine/types.ts'

export interface WorkspacePlan {
  id: string
  name: string
  kind: 'primary' | 'alternative'
  version: number
  versionId: string
  /** History and planned courses together, as the engine expects. */
  placements: Placement[]
  reasons: Record<string, PlacementReason[]>
}

export interface Workspace {
  viewer: Viewer
  school: SchoolConfig
  history: Placement[]
  plan: WorkspacePlan
  plans: PlanSummary[]
  aiEnabled: boolean
}

/**
 * Everything a planner page needs, loaded for the signed-in student only.
 * `planId` selects an alternative plan; anything the student doesn't own
 * falls back to their primary plan.
 */
export const loadWorkspace = cache(async (planId?: string): Promise<Workspace> => {
  const viewer = await requireStudent()
  const db = await getDb()
  const studentId = viewer.student.id
  if (!viewer.student.schoolId) redirect('/onboarding')
  const school = await loadSchool(db, viewer.student.schoolId)
  if (!school) redirect('/onboarding')

  const [history, plans] = await Promise.all([getHistory(db, studentId), listPlans(db, studentId)])
  const chosen = (planId && plans.find((p) => p.id === planId)?.id) || (await getPrimaryPlanId(db, studentId))
  if (!chosen) redirect('/onboarding')
  const latest = await getLatestVersion(db, studentId, chosen)
  if (!latest) redirect('/onboarding')
  const summary = plans.find((p) => p.id === chosen)!

  return {
    viewer,
    school,
    history,
    plan: {
      id: chosen,
      name: summary.name,
      kind: summary.kind,
      version: latest.version,
      versionId: latest.id,
      placements: [...history, ...latest.placements],
      reasons: latest.reasons as Record<string, PlacementReason[]>,
    },
    plans,
    aiEnabled: isAiConfigured(),
  }
})
