import type { Metadata } from 'next'
import { loadWorkspace } from '@/lib/workspace'
import { CatalogBrowser } from '@/components/explore/catalog-browser'

export const metadata: Metadata = { title: 'Explore' }

export default async function ExplorePage() {
  const ws = await loadWorkspace()
  return (
    <main className="mx-auto max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
      <header>
        <p className="eyebrow">Courses and pathways</p>
        <h1 className="mt-2 text-[30px] font-semibold md:text-[36px]">Explore</h1>
        <p className="mt-2 max-w-[640px] text-mist">
          Every course at {ws.school.name}, with what it needs, what it opens, and where it could fit in your plan.
          {ws.school.isDemo ? ' This is the demo catalog — fictional development data.' : ''}
        </p>
      </header>
      <div className="mt-8">
        <CatalogBrowser school={ws.school} placements={ws.plan.placements} startTerm={ws.viewer.student.startTerm ?? 0} preferences={ws.viewer.student.preferences} />
      </div>
    </main>
  )
}
