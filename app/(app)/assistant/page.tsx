import type { Metadata } from 'next'
import { suggestedQuestions } from '@/lib/ai/suggestions'
import { buildCatalog } from '@/lib/engine'
import { loadWorkspace } from '@/lib/workspace'
import { AssistantPanel } from '@/components/assistant/assistant-panel'

export const metadata: Metadata = { title: 'Compass AI' }

export default async function AssistantPage() {
  const ws = await loadWorkspace()
  const catalog = buildCatalog(ws.school)
  const suggestions = suggestedQuestions(catalog, ws.plan.placements, ws.viewer.student.preferences)
  return (
    <main className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-[820px] flex-col px-5 py-8 md:px-8 lg:h-dvh md:py-10">
      <header className="shrink-0">
        <p className="eyebrow">Your academic guide</p>
        <h1 className="mt-2 text-[30px] font-semibold md:text-[36px]">Compass AI</h1>
        <p className="mt-2 max-w-[620px] text-mist">
          Compass AI explains your plan in plain language. Every fact it uses comes from your school’s catalog and the
          Compass engine, and it can only preview changes — you decide what to apply. It sees your plan and your school’s
          catalog, nothing else.
        </p>
      </header>
      <div className="mt-8 min-h-0 flex-1">
        <AssistantPanel aiEnabled={ws.aiEnabled} suggestions={suggestions} />
      </div>
    </main>
  )
}
