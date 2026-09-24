import type { Metadata } from 'next'
import type { GoalId, Rigor } from '@/lib/engine'
import { GOAL_IDS } from '@/lib/goals'
import { loadWorkspace } from '@/lib/workspace'
import { WhatIfStudio, type InitialScenario } from '@/components/whatif/studio'

export const metadata: Metadata = { title: 'What If?' }

const KINDS = ['replace', 'move', 'drop', 'add', 'priorities'] as const
const RIGORS = ['balanced', 'challenging', 'very-rigorous', 'maximum'] as const

export default async function WhatIfPage(props: PageProps<'/what-if'>) {
  const search = await props.searchParams
  const ws = await loadWorkspace()
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const kind = str(search.kind)
  const term = str(search.term)
  const rigor = str(search.rigor)
  const initial: InitialScenario = {
    ...(kind && (KINDS as readonly string[]).includes(kind) ? { kind: kind as InitialScenario['kind'] } : {}),
    ...(str(search.course) ? { course: str(search.course) } : {}),
    ...(str(search.with) ? { with: str(search.with) } : {}),
    ...(term && /^[0-7]$/.test(term) ? { term: Number(term) } : {}),
    ...(rigor && (RIGORS as readonly string[]).includes(rigor) ? { rigor: rigor as Rigor } : {}),
    ...(str(search.goals) !== undefined
      ? { goals: str(search.goals)!.split(',').filter((g): g is GoalId => (GOAL_IDS as string[]).includes(g)) }
      : {}),
  }
  return (
    <main className="mx-auto max-w-[1500px] px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-[720px]">
        <p className="eyebrow">Explore another route</p>
        <h1 className="mt-2 text-[30px] font-semibold md:text-[36px]">What if?</h1>
        <p className="mt-2 text-mist">
          Try a different route through high school. Compass re-plans with the same rules it always uses and shows you the
          consequences side by side. Nothing changes until you apply it.
        </p>
      </header>
      <div className="mt-8">
        <WhatIfStudio
          school={ws.school}
          placements={ws.plan.placements}
          startTerm={ws.viewer.student.startTerm ?? 0}
          preferences={ws.viewer.student.preferences}
          planId={ws.plan.id}
          planName={ws.plan.name}
          version={ws.plan.version}
          initial={initial}
        />
      </div>
    </main>
  )
}
