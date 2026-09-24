import type { Metadata } from 'next'
import { getDb } from '@/lib/db/client'
import { listVersions } from '@/lib/data/plans'
import { loadWorkspace } from '@/lib/workspace'
import { PlanWorkspace } from '@/components/plan/workspace'

export const metadata: Metadata = { title: 'My Plan' }

export default async function PlanPage(props: PageProps<'/plan'>) {
  const search = await props.searchParams
  const planId = typeof search.plan === 'string' ? search.plan : undefined
  const course = typeof search.course === 'string' ? search.course : undefined
  const moveTo = typeof search.moveTo === 'string' && /^[0-7]$/.test(search.moveTo) ? Number(search.moveTo) : null
  const ws = await loadWorkspace(planId)
  const db = await getDb()
  const versions = await listVersions(db, ws.viewer.student.id, ws.plan.id)
  const initial = course ? ws.plan.placements.find((p) => p.courseId === course) : undefined
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      <PlanWorkspace
        key={`${ws.plan.id}:${ws.plan.version}`}
        school={ws.school}
        startTerm={ws.viewer.student.startTerm ?? 0}
        preferences={ws.viewer.student.preferences}
        planId={ws.plan.id}
        planName={ws.plan.name}
        planKind={ws.plan.kind}
        version={ws.plan.version}
        placements={ws.plan.placements}
        reasons={ws.plan.reasons}
        plans={ws.plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
        versions={versions.map((v) => ({ id: v.id, version: v.version, summary: v.summary, createdAt: v.createdAt.toISOString(), validationStatus: v.validationStatus }))}
        initialSelected={initial ? `${initial.courseId}@${initial.term}` : null}
        initialPreview={course && moveTo !== null ? { courseId: course, toTerm: moveTo } : null}
      />
    </main>
  )
}
