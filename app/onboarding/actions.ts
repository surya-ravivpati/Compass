'use server'

import { z } from 'zod'
import { requireViewer } from '@/lib/auth/viewer'
import { currentAcademicYear, graduationYear, startTermFor } from '@/lib/calendar'
import { getDb } from '@/lib/db/client'
import { loadSchool } from '@/lib/db/schools'
import { createPlan } from '@/lib/data/plans'
import { saveProfileAndHistory } from '@/lib/data/students'
import { buildCatalog, generatePlan, type GenerationStage, type Placement, type Preferences, type SchoolConfig } from '@/lib/engine'
import type { Finding } from '@/lib/engine'
import { GOAL_IDS } from '@/lib/goals'

const activitySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['sport', 'club', 'job', 'other']),
  seasons: z.array(z.enum(['fall', 'winter', 'spring', 'year-round'])).min(1).max(4),
  hoursPerWeek: z.number().int().min(1).max(60),
})

const inputSchema = z.object({
  schoolId: z.string().min(1).max(80),
  firstName: z.string().trim().max(40).optional(),
  grade: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12)]),
  yearStarted: z.boolean(),
  academicYear: z.number().int().min(2000).max(2100),
  mathPlacement: z.string().min(1).max(80),
  mathPlacementNote: z.string().trim().max(200).optional(),
  preHighSchool: z.array(z.string().max(80)).max(20),
  completed: z.array(z.object({ courseId: z.string().max(80), term: z.number().int().min(0).max(7) })).max(80),
  inProgress: z.array(z.object({ courseId: z.string().max(80), term: z.number().int().min(0).max(7) })).max(12),
  goals: z.array(z.enum(GOAL_IDS)).max(14),
  interests: z.array(z.string().trim().min(1).max(40)).max(12),
  notes: z.string().trim().max(500).optional(),
  rigor: z.enum(['balanced', 'challenging', 'very-rigorous', 'maximum']),
  balanceFirst: z.boolean(),
  activities: z.array(activitySchema).max(8),
  language: z.string().max(40).optional(),
})

export type OnboardingInput = z.infer<typeof inputSchema>

export type OnboardingResult =
  | {
      ok: true
      status: 'valid' | 'no-valid-schedule'
      stages: GenerationStage[]
      placements: Placement[]
      startTerm: number
      problems: Finding[]
      notes: string[]
    }
  | { ok: false; error: string }

export async function loadSchoolForOnboarding(schoolId: string): Promise<SchoolConfig | null> {
  await requireViewer()
  const db = await getDb()
  return loadSchool(db, schoolId)
}

/**
 * Saves the student's starting point and generates their first plan. The
 * plan comes from the deterministic generator; the stages returned are the
 * ones it actually ran, for the reveal.
 */
export async function completeOnboarding(raw: OnboardingInput): Promise<OnboardingResult> {
  const viewer = await requireViewer()
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Some answers look incomplete. Go back and check them.' }
  const input = parsed.data
  const db = await getDb()
  const school = await loadSchool(db, input.schoolId)
  if (!school) return { ok: false, error: 'That school is not available.' }
  const catalog = buildCatalog(school)

  const startTerm = startTermFor(input.grade, input.yearStarted)
  const known = (id: string) => catalog.courses.has(id)
  const placement = school.mathPlacement.find((m) => m.id === input.mathPlacement)
  if (!placement && input.mathPlacement !== 'other') return { ok: false, error: 'Choose the math you finished before high school.' }

  const history: Placement[] = []
  const seen = new Set<string>()
  const push = (p: Placement) => {
    const key = `${p.courseId}@${p.term}`
    if (!known(p.courseId) || seen.has(key)) return
    seen.add(key)
    history.push(p)
  }
  for (const id of placement?.completes ?? []) push({ courseId: id, term: -1, status: 'completed' })
  for (const id of input.preHighSchool) push({ courseId: id, term: -1, status: 'completed' })
  for (const c of input.completed) {
    if (c.term >= startTerm - (input.yearStarted ? 2 : 0)) continue
    push({ courseId: c.courseId, term: c.term, status: 'completed' })
  }
  if (input.yearStarted) {
    for (const c of input.inProgress) {
      if (c.term < startTerm - 2 || c.term >= startTerm) continue
      push({ courseId: c.courseId, term: c.term, status: 'in-progress' })
    }
  }

  const languageIds = new Set(school.courses.flatMap((c) => (c.sequence ? [c.sequence.id] : [])))
  const preferences: Preferences = {
    goals: [...new Set(input.goals)],
    rigor: input.rigor,
    balanceFirst: input.balanceFirst,
    interests: [...new Set(input.interests.map((i) => i.toLowerCase()))],
    activities: input.activities,
    targetCourses: [],
    avoidCourses: [],
    ...(input.language && languageIds.has(input.language) ? { language: input.language } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  }

  const result = generatePlan({ catalog, student: { startTerm }, history, preferences })

  await saveProfileAndHistory(
    db,
    viewer.student.id,
    {
      schoolId: school.id,
      firstName: input.firstName || null,
      grade: input.grade,
      yearStarted: input.yearStarted,
      academicYear: input.academicYear || currentAcademicYear(new Date()),
      graduationYear: graduationYear(input.grade, input.academicYear),
      startTerm,
      mathPlacement: input.mathPlacement,
      mathPlacementNote: input.mathPlacementNote || null,
      preferences,
    },
    history,
    { markOnboarded: true },
  )
  await createPlan(
    db,
    viewer.student.id,
    { name: 'My plan', kind: 'primary' },
    {
      summary: result.status === 'valid' ? 'Generated your four-year plan' : 'Generated a plan that needs attention',
      change: { kind: 'generated', status: result.status },
      validationStatus: result.validation.status,
      reasons: result.reasons,
      placements: result.plan.placements.filter((p) => p.status === 'planned'),
    },
  )

  return {
    ok: true,
    status: result.status,
    stages: result.stages,
    placements: result.plan.placements,
    startTerm,
    problems: result.problems.slice(0, 6),
    notes: result.notes,
  }
}
