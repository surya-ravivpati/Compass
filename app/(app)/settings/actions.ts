'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { endSession, requireStudent } from '@/lib/auth/viewer'
import { graduationYear, startTermFor } from '@/lib/calendar'
import { getDb } from '@/lib/db/client'
import { loadSchool } from '@/lib/db/schools'
import { deleteAccount } from '@/lib/data/accounts'
import { commitVersion, getLatestVersion, getPrimaryPlanId } from '@/lib/data/plans'
import { getHistory, savePreferences, saveProfileAndHistory } from '@/lib/data/students'
import { buildCatalog, diffPlans, generatePlan, type Placement, type Preferences } from '@/lib/engine'
import { GOAL_IDS } from '@/lib/goals'

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string }

const recordSchema = z.object({
  firstName: z.string().trim().max(40),
  grade: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
  yearStarted: z.boolean(),
  academicYear: z.number().int().min(2000).max(2100),
  mathPlacement: z.string().min(1).max(80),
  mathPlacementNote: z.string().trim().max(200).optional(),
  preHighSchool: z.array(z.string().max(80)).max(20),
  completed: z.array(z.object({ courseId: z.string().max(80), term: z.number().int().min(0).max(7) })).max(80),
  inProgress: z.array(z.object({ courseId: z.string().max(80), term: z.number().int().min(0).max(7) })).max(12),
})

/** Updates where the student is and what they've taken. The plan isn't rebuilt unless they ask. */
export async function saveRecordAction(raw: z.input<typeof recordSchema>): Promise<SettingsResult> {
  const viewer = await requireStudent()
  const parsed = recordSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Some answers look incomplete.' }
  const input = parsed.data
  const db = await getDb()
  const s = viewer.student
  const school = s.schoolId ? await loadSchool(db, s.schoolId) : null
  if (!school) return { ok: false, error: 'Your school’s catalog is unavailable.' }
  const catalog = buildCatalog(school)
  const startTerm = startTermFor(input.grade, input.yearStarted)
  const option = school.mathPlacement.find((m) => m.id === input.mathPlacement)
  const history: Placement[] = []
  const seen = new Set<string>()
  const push = (p: Placement) => {
    if (!catalog.courses.has(p.courseId) || seen.has(`${p.courseId}@${p.term}`)) return
    seen.add(`${p.courseId}@${p.term}`)
    history.push(p)
  }
  for (const id of option?.completes ?? []) push({ courseId: id, term: -1, status: 'completed' })
  for (const id of input.preHighSchool) push({ courseId: id, term: -1, status: 'completed' })
  const lastCompleted = input.yearStarted ? startTerm - 2 : startTerm
  for (const c of input.completed) if (c.term < lastCompleted) push({ ...c, status: 'completed' })
  if (input.yearStarted) for (const c of input.inProgress) if (c.term >= startTerm - 2 && c.term < startTerm) push({ ...c, status: 'in-progress' })

  await saveProfileAndHistory(
    db,
    s.id,
    {
      schoolId: school.id,
      firstName: input.firstName || null,
      grade: input.grade,
      yearStarted: input.yearStarted,
      academicYear: input.academicYear,
      graduationYear: graduationYear(input.grade, input.academicYear),
      startTerm,
      mathPlacement: input.mathPlacement,
      mathPlacementNote: input.mathPlacementNote || null,
      preferences: s.preferences,
    },
    history,
  )
  return { ok: true, message: 'Saved. Your plan now shows anything this changed — rebuild it below if you want Compass to re-plan.' }
}

const preferencesSchema = z.object({
  goals: z.array(z.enum(GOAL_IDS)).max(14),
  rigor: z.enum(['balanced', 'challenging', 'very-rigorous', 'maximum']),
  balanceFirst: z.boolean(),
  activities: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        kind: z.enum(['sport', 'club', 'job', 'other']),
        seasons: z.array(z.enum(['fall', 'winter', 'spring', 'year-round'])).min(1).max(4),
        hoursPerWeek: z.number().int().min(1).max(60),
      }),
    )
    .max(8),
  language: z.string().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
})

export async function savePreferencesAction(raw: z.input<typeof preferencesSchema>): Promise<SettingsResult> {
  const viewer = await requireStudent()
  const parsed = preferencesSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Those preferences could not be saved.' }
  const db = await getDb()
  const prefs: Preferences = {
    ...viewer.student.preferences,
    goals: parsed.data.goals,
    rigor: parsed.data.rigor,
    balanceFirst: parsed.data.balanceFirst,
    activities: parsed.data.activities,
    ...(parsed.data.language ? { language: parsed.data.language } : { language: undefined }),
    ...(parsed.data.notes ? { notes: parsed.data.notes } : { notes: undefined }),
  }
  await savePreferences(db, viewer.student.id, prefs)
  return { ok: true, message: 'Saved. Preferences shape future suggestions; your current plan stays as it is until you rebuild it.' }
}

/** Re-plans from the saved settings as a new version of the primary plan, at the student's request. */
export async function rebuildPlanAction(): Promise<SettingsResult> {
  const viewer = await requireStudent()
  const db = await getDb()
  const s = viewer.student
  const school = s.schoolId ? await loadSchool(db, s.schoolId) : null
  const planId = await getPrimaryPlanId(db, s.id)
  if (!school || !planId) return { ok: false, error: 'Your plan could not be loaded.' }
  const latest = await getLatestVersion(db, s.id, planId)
  if (!latest) return { ok: false, error: 'Your plan could not be loaded.' }
  const history = await getHistory(db, s.id)
  const catalog = buildCatalog(school)
  const result = generatePlan({ catalog, student: { startTerm: s.startTerm ?? 0 }, history, preferences: s.preferences })
  const planned = result.plan.placements.filter((p) => p.status === 'planned')
  const diff = diffPlans({ placements: latest.placements }, { placements: planned })
  await commitVersion(db, s.id, planId, latest.version, {
    summary: 'Rebuilt from your settings',
    change: { kind: 'rebuild', status: result.status },
    validationStatus: result.validation.status,
    reasons: result.reasons,
    placements: planned,
  })
  const changed = diff.added.length + diff.removed.length + diff.moved.length
  return result.status === 'valid'
    ? { ok: true, message: `Rebuilt as version ${latest.version + 1}: ${changed} change${changed === 1 ? '' : 's'}. The previous version is in your plan’s history.` }
    : { ok: true, message: `Rebuilt as version ${latest.version + 1}, but Compass couldn’t find a fully valid path. Open My Plan to see why.` }
}

export async function deleteAccountAction(confirm: string): Promise<SettingsResult> {
  const viewer = await requireStudent()
  if (confirm !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm.' }
  const db = await getDb()
  await endSession()
  await deleteAccount(db, viewer.userId)
  redirect('/')
}
