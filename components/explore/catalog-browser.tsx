'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useMemo, useState } from 'react'
import {
  buildCatalog,
  buildPreferenceModel,
  describeGroup,
  earliestStarts,
  interestScore,
  placementPhrase,
  type Placement,
  type Preferences,
  type SchoolConfig,
} from '@/lib/engine'
import { IconSearch } from '@/components/ui/icons'
import { PathwayGraph, type NodeState } from './pathway-graph'

const LEVELS = [
  { id: 'standard', label: 'Standard' },
  { id: 'honors', label: 'Honors' },
  { id: 'ap', label: 'AP' },
  { id: 'post-ap', label: 'College level' },
]

export function CatalogBrowser({
  school,
  placements,
  startTerm,
  preferences,
}: {
  school: SchoolConfig
  placements: Placement[]
  startTerm: number
  preferences: Preferences
}) {
  const catalog = useMemo(() => buildCatalog(school), [school])
  const [tab, setTab] = useState<'courses' | 'pathways'>('courses')
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [fits, setFits] = useState(false)
  const [pathDept, setPathDept] = useState(school.departments[1]?.id ?? school.departments[0]!.id)

  const model = useMemo(() => buildPreferenceModel(preferences, school), [preferences, school])
  const earliest = useMemo(
    () => earliestStarts(catalog, placements.filter((p) => p.status !== 'planned'), startTerm),
    [catalog, placements, startTerm],
  )
  const status = useMemo(() => {
    const states = new Map<string, NodeState>()
    const labels = new Map<string, string>()
    for (const c of catalog.courses.values()) {
      const p = placements.find((x) => x.courseId === c.id)
      if (p?.status === 'completed') {
        states.set(c.id, 'completed')
        labels.set(c.id, p.term < 0 ? 'Completed before high school' : 'Completed')
      } else if (p?.status === 'in-progress') {
        states.set(c.id, 'in-progress')
        labels.set(c.id, 'Taking it now')
      } else if (p) {
        states.set(c.id, 'planned')
        labels.set(c.id, `In your plan · ${placementPhrase(p.term, c.durationTerms)}`)
      } else if (c.equivalenceGroup && placements.some((x) => x.courseId !== c.id && catalog.courses.get(x.courseId)?.equivalenceGroup === c.equivalenceGroup)) {
        const twin = placements.find((x) => x.courseId !== c.id && catalog.courses.get(x.courseId)?.equivalenceGroup === c.equivalenceGroup)!
        states.set(c.id, 'covered')
        labels.set(c.id, `Same material as ${catalog.courses.get(twin.courseId)!.name}`)
      } else {
        const e = earliest.get(c.id)
        if (e?.term == null) {
          states.set(c.id, 'unreachable')
          labels.set(c.id, 'Out of reach before graduation')
        } else {
          states.set(c.id, 'available')
          labels.set(c.id, `Earliest: ${placementPhrase(e.term, c.durationTerms)}`)
        }
      }
    }
    return { states, labels }
  }, [catalog, placements, earliest])

  const taken = useMemo(() => new Set(placements.map((p) => p.courseId)), [placements])

  const courses = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...catalog.courses.values()]
      .filter((c) => !dept || c.department === dept)
      .filter((c) => !level || c.level === level)
      .filter((c) => !fits || interestScore(model, c) > 0)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)))
  }, [catalog, dept, level, fits, query, model])

  const departments = [...school.departments].sort((a, b) => a.order - b.order)
  const grouped = departments
    .map((d) => ({ d, list: courses.filter((c) => c.department === d.id) }))
    .filter((g) => g.list.length)

  return (
    <div>
      <div className="flex rounded-lg border border-line-strong p-0.5" role="tablist" aria-label="Explore view" style={{ width: 'fit-content' }}>
        {(['courses', 'pathways'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`btn btn-sm h-8 capitalize ${tab === t ? 'bg-white/10 text-ink' : 'text-mist'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'courses' ? (
        <div className="mt-6" role="tabpanel">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
              <input className="field pl-9" placeholder="Search courses, subjects, or interests" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => setLevel(level === l.id ? null : l.id)} className="chip h-10 text-[13px]">
                  {l.label}
                </button>
              ))}
              <button type="button" aria-pressed={fits} onClick={() => setFits(!fits)} className="chip h-10 text-[13px]" disabled={model.interests.size === 0} title={model.interests.size === 0 ? 'Pick goals in Settings first' : undefined}>
                Fits my goals
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Departments">
            <button type="button" aria-pressed={dept === null} onClick={() => setDept(null)} className="chip h-8 text-[13px]">
              All
            </button>
            {departments.map((d) => (
              <button key={d.id} type="button" aria-pressed={dept === d.id} onClick={() => setDept(dept === d.id ? null : d.id)} className="chip h-8 text-[13px]">
                {d.name}
              </button>
            ))}
          </div>

          <p className="mt-5 text-sm text-fog" aria-live="polite">
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </p>
          <div className="mt-3 space-y-8">
            {grouped.map(({ d, list }) => (
              <section key={d.id} aria-labelledby={`dept-${d.id}`}>
                <h2 id={`dept-${d.id}`} className="eyebrow">
                  {d.name}
                </h2>
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {list.map((c) => {
                    const state = status.states.get(c.id)
                    return (
                      <li key={c.id}>
                        <Link href={`/explore/${c.id}` as Route} className="grid gap-1 px-4 py-3 transition-colors hover:bg-white/[0.03] md:grid-cols-[1fr_260px] md:items-center md:gap-4">
                          <span className="min-w-0">
                            <span className="block text-[14.5px]">{c.name}</span>
                            <span className="mt-0.5 block truncate text-[12.5px] text-fog">
                              {LEVELS.find((l) => l.id === c.level)?.label} · {c.durationTerms === 2 ? 'Full year' : `Semester (${c.seasons.join(' or ')})`} · {c.credits} cr
                              {c.prerequisites.length ? ` · Needs ${c.prerequisites.map((g) => describeGroup(catalog, g)).join('; ')}` : ''}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-fog/80">
                              {(catalog.dependents.get(c.id) ?? []).length
                                ? `Opens → ${(catalog.dependents.get(c.id) ?? []).map((id) => catalog.courses.get(id)!.name).slice(0, 3).join(', ')}${(catalog.dependents.get(c.id) ?? []).length > 3 ? '…' : ''} · `
                                : ''}
                              Counts toward {c.satisfies.length ? c.satisfies.map((id) => catalog.requirements.get(id)?.name).join(', ') : 'Electives'}
                            </span>
                          </span>
                          <span className={`text-[12.5px] md:text-right ${state === 'planned' || state === 'completed' || state === 'in-progress' ? 'text-signal-hi' : state === 'unreachable' || state === 'covered' ? 'text-fog' : 'text-mist'}`}>
                            {status.labels.get(c.id)}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {grouped.length === 0 ? <p className="text-mist">No courses match. Try fewer filters.</p> : null}
          </div>
        </div>
      ) : (
        <div className="mt-6" role="tabpanel">
          <label className="flex items-center gap-3 text-sm text-mist">
            Department
            <select className="field h-9 w-auto" value={pathDept} onChange={(e) => setPathDept(e.target.value)}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-fog">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-signal-line bg-signal-soft" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-signal/70" /> In your plan</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-line-strong" /> Open to you</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-line" /> Out of reach</span>
          </div>
          <p className="mt-2 text-sm text-mist">Arrows run from prerequisite to course. Hover or focus a course to trace everything before and after it.</p>
          <div className="surface mt-4 p-5">
            <PathwayGraph catalog={catalog} department={pathDept} states={status.states} labels={status.labels} taken={taken} />
          </div>
        </div>
      )}
    </div>
  )
}
