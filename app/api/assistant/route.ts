import { z } from 'zod'
import { getViewer } from '@/lib/auth/viewer'
import { allowAttempt } from '@/lib/auth/rate-limit'
import { askCompass } from '@/lib/ai/assistant'
import { isAiConfigured } from '@/lib/ai/config'
import { assistantContext } from '@/lib/ai/context'
import { getDb } from '@/lib/db/client'

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) }))
    .min(1)
    .max(24),
  planId: z.uuid().optional(),
})

/**
 * Compass AI. Server-side only: the Gemini key never reaches the browser, and
 * the model sees nothing but this student's plan and their school's catalog.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 })
  }
  const viewer = await getViewer()
  if (!viewer) return Response.json({ error: 'Sign in to use Compass AI.' }, { status: 401 })
  if (!viewer.student.onboarded) return Response.json({ error: 'Finish setting up your plan first.' }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'That message could not be read.' }, { status: 400 })

  if (!isAiConfigured()) {
    return Response.json({ status: 'offline', text: '', facts: [], proposals: [], toolsUsed: [] })
  }
  if (!allowAttempt(`ai:${viewer.userId}`, 40, 10 * 60 * 1000)) {
    return Response.json(
      { status: 'error', text: 'You’ve asked a lot of questions quickly. Wait a few minutes and try again.', facts: [], proposals: [], toolsUsed: [] },
      { status: 429 },
    )
  }

  const db = await getDb()
  const ctx = await assistantContext(db, viewer, parsed.data.planId)
  if (!ctx) return Response.json({ error: 'Your plan could not be loaded.' }, { status: 404 })
  const reply = await askCompass(ctx.tools, ctx.student, parsed.data.messages)
  return Response.json(reply, { headers: { 'cache-control': 'no-store' } })
}
