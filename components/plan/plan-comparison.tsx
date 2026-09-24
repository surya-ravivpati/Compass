'use client'

import { useMemo } from 'react'
import { comparePlans, placementPhrase, type Catalog, type Placement, type Preferences } from '@/lib/engine'
import { StatusIcon } from '@/components/ui/status'

/** Two saved plans side by side, as consequences. */
export function PlanComparisonView({
  catalog,
  startTerm,
  preferences,
  primary,
  alternative,
}: {
  catalog: Catalog
  startTerm: number
  preferences: Preferences
  primary: Placement[]
  alternative: Placement[]
}) {
  const c = useMemo(
    () => comparePlans(catalog, { startTerm }, preferences, { placements: primary }, { placements: alternative }),
    [catalog, startTerm, preferences, primary, alternative],
  )
  const where = (id: string, term: number) => placementPhrase(term, catalog.courses.get(id)?.durationTerms ?? 1)
  const changes = [
    ...c.diff.added.map((p) => `Adds ${catalog.courses.get(p.courseId)?.name} (${where(p.courseId, p.term)})`),
    ...c.diff.removed.map((p) => `Drops ${catalog.courses.get(p.courseId)?.name} (${where(p.courseId, p.term)})`),
    ...c.diff.moved.map((m) => `Moves ${catalog.courses.get(m.courseId)?.name}: ${where(m.courseId, m.fromTerm)} → ${where(m.courseId, m.toTerm)}`),
  ]
  const workload = c.workload.filter((w) => w.before !== w.after)
  return (
    <div className="space-y-5 text-sm">
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-2">
          <StatusIcon status={c.validity.before} /> Primary: {c.validity.before === 'invalid' ? 'has conflicts' : 'valid'}
        </span>
        <span className="flex items-center gap-2">
          <StatusIcon status={c.validity.after} /> This plan: {c.validity.after === 'invalid' ? 'has conflicts' : 'valid'}
        </span>
      </p>
      <Block title="Courses" items={changes} empty="The two plans have the same courses in the same terms." />
      <Block title="Prerequisites" items={c.prerequisiteEffects.map((e) => e.text)} empty="No prerequisite differences." />
      <Block
        title="Requirements"
        items={c.requirementChanges.map((r) => `${r.name}: ${r.before.covered} → ${r.after.covered} of ${r.required} credits planned`)}
        empty="Requirements are covered the same way."
      />
      <Block
        title="Workload"
        items={workload.map((w) => `${where('', w.term).replace(/^\w/, (x) => x.toUpperCase())}: ${w.before} → ${w.after}${w.afterLabs !== w.beforeLabs ? ` · labs ${w.beforeLabs} → ${w.afterLabs}` : ''}`)}
        empty="Workload is the same every semester."
      />
    </div>
  )
}

function Block({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section>
      <h3 className="eyebrow">{title}</h3>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-mist">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-fog">{empty}</p>
      )}
    </section>
  )
}
