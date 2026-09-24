'use server'

import { requireStudent, requireViewer } from '@/lib/auth/viewer'
import { allowAttempt } from '@/lib/auth/rate-limit'
import { isAiConfigured } from '@/lib/ai/config'
import { assistantContext } from '@/lib/ai/context'
import { explainCourse, type CourseExplainer } from '@/lib/ai/explainer'
import { interpretGoals } from '@/lib/ai/goals'
import { getDb } from '@/lib/db/client'
import { loadSchool } from '@/lib/db/schools'
import type { GoalId } from '@/lib/engine'

export type ExplainerResult = { ok: true; explainer: CourseExplainer } | { ok: false; error: string }

export async function explainCourseAction(courseId: string): Promise<ExplainerResult> {
  const viewer = await requireStudent()
  if (!isAiConfigured()) return { ok: false, error: 'Compass AI is not configured.' }
  if (!allowAttempt(`ai:${viewer.userId}`, 40, 10 * 60 * 1000)) return { ok: false, error: 'Too many requests. Try again in a few minutes.' }
  const db = await getDb()
  const ctx = await assistantContext(db, viewer)
  const course = ctx?.tools.catalog.courses.get(courseId)
  if (!ctx || !course) return { ok: false, error: 'That course is not in your school’s catalog.' }
  try {
    return { ok: true, explainer: await explainCourse(db, ctx.tools.catalog, ctx.catalogVersion, course) }
  } catch (err) {
    console.error('explainCourseAction failed', err)
    return { ok: false, error: 'Compass AI is unavailable right now. Everything on this page comes from the catalog and still applies.' }
  }
}

export type GoalSuggestion = { ok: true; goals: GoalId[]; interests: string[] } | { ok: false; error: string }

export async function suggestGoalsAction(input: { schoolId: string; text: string }): Promise<GoalSuggestion> {
  const viewer = await requireViewer()
  if (!isAiConfigured()) return { ok: false, error: 'Compass AI is not configured.' }
  if (!allowAttempt(`ai:${viewer.userId}`, 40, 10 * 60 * 1000)) return { ok: false, error: 'Too many requests. Try again in a few minutes.' }
  const text = input.text.trim().slice(0, 500)
  if (text.length < 3) return { ok: false, error: 'Write a little more first.' }
  const db = await getDb()
  const school = await loadSchool(db, input.schoolId)
  if (!school) return { ok: false, error: 'That school is not available.' }
  try {
    const tags = [...new Set(school.courses.flatMap((c) => c.tags))].sort()
    return { ok: true, ...(await interpretGoals(text, tags)) }
  } catch (err) {
    console.error('suggestGoalsAction failed', err)
    return { ok: false, error: 'Compass AI couldn’t read that right now. Pick goals above instead.' }
  }
}
