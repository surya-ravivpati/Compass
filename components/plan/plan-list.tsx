'use client'

import { occupiedTerms, termLabel, YEAR_NAMES, type Catalog, type Finding, type Placement } from '@/lib/engine'
import { IconAlert, IconBlocked, IconCheck } from '@/components/ui/icons'
import { keyOf } from '@/components/map/layout'

/** The plan as nested lists: the accessible and small-screen view of the map. */
export function PlanList({
  catalog,
  placements,
  findings,
  selected,
  onSelect,
}: {
  catalog: Catalog
  placements: Placement[]
  findings: Finding[]
  selected: string | null
  onSelect: (key: string) => void
}) {
  const problem = (p: Placement) => {
    const own = findings.filter((f) => f.courseId === p.courseId && f.term === p.term)
    return own.some((f) => f.severity === 'error') ? 'error' : own.some((f) => f.severity === 'warning') ? 'warning' : null
  }
  const pre = placements.filter((p) => p.term < 0)
  return (
    <div className="space-y-8">
      {pre.length ? (
        <section aria-label="Before high school">
          <h3 className="eyebrow">Before high school</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pre.map((p) => (
              <li key={keyOf(p)} className="rounded-md border border-line px-2 py-1 text-sm text-mist">
                {catalog.courses.get(p.courseId)?.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {[0, 1, 2, 3].map((year) => (
        <section key={year} aria-label={`${YEAR_NAMES[year]} year`}>
          <h3 className="text-[15px] font-semibold">
            {YEAR_NAMES[year]} <span className="ml-1 text-sm font-normal text-fog">Grade {9 + year}</span>
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[year * 2, year * 2 + 1].map((term) => {
              const here = placements
                .filter((p) => p.term >= 0 && occupiedTerms(p.term, catalog.courses.get(p.courseId)?.durationTerms ?? 1).includes(term))
                .sort((a, b) => (catalog.departments.get(catalog.courses.get(a.courseId)!.department)?.order ?? 99) - (catalog.departments.get(catalog.courses.get(b.courseId)!.department)?.order ?? 99))
              return (
                <div key={term}>
                  <p className="text-[12px] text-fog">
                    {termLabel(term).split(' ')[1]} · {here.length} courses
                  </p>
                  <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
                    {here.map((p) => {
                      const c = catalog.courses.get(p.courseId)!
                      const key = keyOf(p)
                      const issue = problem(p)
                      return (
                        <li key={`${key}-${term}`}>
                          <button
                            type="button"
                            onClick={() => onSelect(key)}
                            aria-pressed={selected === key}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${selected === key ? 'bg-signal-soft' : 'hover:bg-white/[0.03]'}`}
                          >
                            <span className="flex items-center gap-2">
                              {issue === 'error' ? <IconBlocked size={14} className="text-danger" /> : issue === 'warning' ? <IconAlert size={14} className="text-warn" /> : null}
                              {c.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-fog">
                              {p.status === 'completed' ? <IconCheck size={12} /> : null}
                              {c.durationTerms === 2 ? 'Year' : 'Sem'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
