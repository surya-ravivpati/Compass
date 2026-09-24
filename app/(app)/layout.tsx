import { requireStudent } from '@/lib/auth/viewer'
import { suggestedQuestions } from '@/lib/ai/suggestions'
import { buildCatalog } from '@/lib/engine'
import { loadWorkspace } from '@/lib/workspace'
import { AssistantLauncher } from '@/components/assistant/launcher'
import { MobileNav, Sidebar } from '@/components/shell/nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStudent()
  const ws = await loadWorkspace()
  const suggestions = suggestedQuestions(buildCatalog(ws.school), ws.plan.placements, viewer.student.preferences)
  const name = viewer.student.firstName || viewer.email
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={name} school={ws.school.name} isDemo={ws.school.isDemo} />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <div className="pb-24 lg:pb-0">{children}</div>
      </div>
      <AssistantLauncher aiEnabled={ws.aiEnabled} suggestions={suggestions} />
    </div>
  )
}
