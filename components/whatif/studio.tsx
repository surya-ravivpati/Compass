'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  buildCatalog,
  moveOptions,
  placementPhrase,
  runScenario,
  termLabel,
  YEAR_NAMES,
  type GoalId,
  type Placement,
  type Preferences,
  type Rigor,
  type Scenario,
  type ScenarioResult,
  type SchoolConfig,
} from '@/lib/engine'
import { GOALS, RIGOR_OPTIONS } from '@/lib/goals'
import { commitPlanAction } from '@/app/(app)/plan/actions'
import { saveScenarioAction } from '@/app/(app)/what-if/actions'
import { PathMap } from '@/components/map/path-map'
import { keyOf } from '@/components/map/layout'
import { IconArrowRight, IconCheckCircle } from '@/components/ui/icons'
import { StatusIcon } from '@/components/ui/status'

type Kind = 'replace' | 'move' | 'drop' | 'add' | 'priorities'

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'replace', label: 'Swap a course', hint: 'Take one course instead of another.' },
  { id: 'move', label: 'Move a course', hint: 'Take a course earlier or later.' },
  { id: 'drop', label: 'Drop a course', hint: 'Leave a course (or a language) out.' },
  { id: 'add', label: 'Add a course', hint: 'Fit in something new.' },
  { id: 'priorities', label: 'Change priorities', hint: 'Different rigor or goals.' },
]

export interface InitialScenario {
  kind?: Kind
  course?: string
  with?: string
  term?: number
  rigor?: Rigor
  goals?: GoalId[]
}

export function WhatIfStudio({
  school,
  placements,
  startTerm,
  preferences,
  planId,
  planName,
  version,
  initial,
}: {
  school: SchoolConfig
  placements: Placement[]
  startTerm: number
  preferences: Preferences
  planId: string
  planName: string
  version: number
  initial: InitialScenario
}) {
  const router = useRouter()
  const catalog = useMemo(() => buildCatalog(school), [school])
  const student = useMemo(() => ({ startTerm }), [startTerm])
  const plan = useMemo(() => ({ placements }), [placements])
  const planned = placements.filter((p) => p.status === 'planned')
  const inPlan = new Set(placements.map((p) => p.courseId))

  const [kind, setKind] = useState<Kind>(initial.kind ?? 'replace')
  const [course, setCourse] = useState(initial.course?.split(',')[0] ?? '')
  const [withCourse, setWithCourse] = useState(initial.with ?? '')
  const [term, setTerm] = useState<number | ''>(initial.term ?? '')
  const [dropSequence, setDropSequence] = useState(true)
  const [rigor, setRigor] = useState<Rigor>(initial.rigor ?? preferences.rigor)
  const [goals, setGoals] = useState<GoalId[]>(initial.goals ?? preferences.goals)
  const [balanceFirst, setBalanceFirst] = useState(preferences.balanceFirst)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const plannedCourses = planned
    .map((p) => ({ p, c: catalog.courses.get(p.courseId)! }))
    .sort((a, b) => a.p.term - b.p.term || a.c.name.localeCompare(b.c.name))
  const selected = catalog.courses.get(course)
  const selectedPlacement = planned.find((p) => p.courseId === course)

  const swapOptions = useMemo(() => {
    if (!selected) return []
    const taken = new Set(placements.map((p) => p.courseId))
    return [...catalog.courses.values()]
      .filter((c) => c.id !== selected.id && !taken.has(c.id) && (c.department === selected.department || (selected.equivalenceGroup && c.equivalenceGroup === selected.equivalenceGroup)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [catalog, selected, placements])

  const moveTerms = useMemo(() => {
    const p = placements.find((x) => x.courseId === course && x.status === 'planned')
    return p ? moveOptions(catalog, student, plan, p) : []
  }, [catalog, student, plan, placements, course])

  const scenario: Scenario | null = (() => {
    if (kind === 'replace') return selected && withCourse ? { kind, courseId: selected.id, withCourseId: withCourse } : null
    if (kind === 'move') return selected && term !== '' ? { kind, courseId: selected.id, toTerm: Number(term) } : null
    if (kind === 'drop') {
      if (!selected) return null
      const ids =
        dropSequence && selected.sequence
          ? planned.filter((p) => catalog.courses.get(p.courseId)?.sequence?.id === selected.sequence!.id).map((p) => p.courseId)
          : [selected.id]
      return { kind, courseIds: ids.length ? ids : [selected.id] }
    }
    if (kind === 'add') return selected && !inPlan.has(selected.id) ? { kind, courseId: selected.id } : null
    return { kind: 'preferences', preferences: { ...preferences, rigor, goals, balanceFirst } }
  })()

  const run = () => {
    if (!scenario) return
    setMessage(null)
    startTransition(() => {
      try {
        setResult(runScenario(catalog, student, preferences, plan, scenario))
      } catch {
        setMessage('Compass couldn’t evaluate this scenario right now. Your plan has not been modified.')
      }
    })
  }

  const apply = () => {
    if (!result) return
    startTransition(async () => {
      const res = await commitPlanAction({
        planId,
        baseVersion: version,
        placements: result.plan.placements.filter((p) => p.status === 'planned').map((p) => ({ courseId: p.courseId, term: p.term })),
        summary: `What if: ${result.title}`,
        change: { kind: 'what-if', scenario: result.scenario },
        reasons: Object.fromEntries(Object.entries(result.reasons).filter(([k]) => result.plan.placements.some((p) => p.status === 'planned' && keyOf(p) === k))),
      })
      if (!res.ok) setMessage(res.error)
      else router.push('/plan')
    })
  }

  const save = () => {
    if (!result) return
    startTransition(async () => {
      const res = await saveScenarioAction({
        name: result.title.slice(0, 80),
        placements: result.plan.placements.filter((p) => p.status === 'planned').map((p) => ({ courseId: p.courseId, term: p.term })),
        scenario: result.scenario as unknown as Record<string, unknown>,
      })
      if (!res.ok) setMessage(res.error)
      else router.push(`/plan?plan=${res.planId}` as Route)
    })
  }

  const changedAfter = useMemo(() => {
    const map = new Map<string, 'added' | 'moved'>()
    if (!result) return map
    for (const p of result.comparison.diff.added) map.set(keyOf(p), 'added')
    for (const m of result.comparison.diff.moved) map.set(keyOf({ courseId: m.courseId, term: m.toTerm }), 'moved')
    return map
  }, [result])
  const changedBefore = useMemo(() => {
    const map = new Map<string, 'added' | 'moved'>()
    if (!result) return map
    for (const p of result.comparison.diff.removed) map.set(keyOf(p), 'moved')
    for (const m of result.comparison.diff.moved) map.set(keyOf({ courseId: m.courseId, term: m.fromTerm }), 'moved')
    return map
  }, [result])

  return (
    <div>
      <section aria-label="Build a scenario" className="surface p-5 md:p-6">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Scenario type">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              onClick={() => {
                setKind(k.id)
                setResult(null)
              }}
              className="chip"
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-mist">{KINDS.find((k) => k.id === kind)?.hint}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {kind !== 'priorities' ? (
            <label className="block text-sm text-mist">
              {kind === 'add' ? 'Course to add' : kind === 'replace' ? 'Instead of' : 'Course'}
              <select className="field mt-1.5" value={course} onChange={(e) => { setCourse(e.target.value); setWithCourse(''); setTerm(''); setResult(null) }}>
                <option value="">Choose a course…</option>
                {kind === 'add'
                  ? [...catalog.courses.values()]
                      .filter((c) => !inPlan.has(c.id))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                  : YEAR_NAMES.map((year, y) => {
                      const list = plannedCourses.filter(({ p }) => Math.floor(p.term / 2) === y)
                      if (!list.length) return null
                      return (
                        <optgroup key={year} label={`${year} year`}>
                          {list.map(({ p, c }) => (
                            <option key={keyOf(p)} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
              </select>
            </label>
          ) : null}

          {kind === 'replace' && selected ? (
            <label className="block text-sm text-mist">
              Take instead
              <select className="field mt-1.5" value={withCourse} onChange={(e) => { setWithCourse(e.target.value); setResult(null) }}>
                <option value="">Choose a course…</option>
                {swapOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {kind === 'move' && selectedPlacement ? (
            <label className="block text-sm text-mist">
              Move to
              <select className="field mt-1.5" value={term} onChange={(e) => { setTerm(e.target.value === '' ? '' : Number(e.target.value)); setResult(null) }}>
                <option value="">Choose a term…</option>
                {moveTerms.map((m) => (
                  <option key={m.term} value={m.term} disabled={!m.ok}>
                    {placementPhrase(m.term, selected!.durationTerms)}
                    {m.ok ? '' : ` — ${m.reason}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {kind === 'drop' && selected?.sequence ? (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-mist">
              <input type="checkbox" className="h-4 w-4 accent-[#2F8CFF]" checked={dropSequence} onChange={(e) => setDropSequence(e.target.checked)} />
              Drop the rest of this language, too
            </label>
          ) : null}
        </div>

        {kind === 'priorities' ? (
          <div className="mt-2 space-y-5">
            <div>
              <p className="text-sm text-mist">Rigor</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Rigor">
                {RIGOR_OPTIONS.map((r) => (
                  <button key={r.id} type="button" role="radio" aria-checked={rigor === r.id} onClick={() => setRigor(r.id)} className="chip">
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-mist">Goals</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={goals.includes(g.id)}
                    onClick={() => setGoals((list) => (list.includes(g.id) ? list.filter((x) => x !== g.id) : [...list, g.id]))}
                    className="chip h-8 text-[13px]"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-mist">
              <input type="checkbox" className="h-4 w-4 accent-[#2F8CFF]" checked={balanceFirst} onChange={(e) => setBalanceFirst(e.target.checked)} />
              Balance matters more than maximum rigor
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={run} disabled={!scenario || busy} className="btn btn-signal">
            {busy && !result ? 'Mapping this route…' : 'Show consequences'}
            <IconArrowRight size={14} />
          </button>
          <span className="text-xs text-fog">Your plan stays as it is until you choose to apply something.</span>
        </div>
      </section>

      {message ? (
        <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}

      {result ? (
        <section aria-labelledby="result-title" className="mt-8 animate-rise">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Another route</p>
              <h2 id="result-title" className="mt-1.5 text-[24px] font-semibold">
                {result.title}
              </h2>
              <p className="mt-1.5 flex items-center gap-2 text-sm">
                <StatusIcon status={result.status === 'valid' ? 'valid' : 'invalid'} />
                {result.status === 'valid' ? 'A valid path exists this way.' : 'No valid schedule this way.'}
              </p>
            </div>
            {result.status === 'valid' ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={apply} disabled={busy} className="btn btn-primary btn-sm">
                  Apply to {planName}
                </button>
                <button type="button" onClick={save} disabled={busy} className="btn btn-ghost btn-sm">
                  Save as alternative plan
                </button>
                <button type="button" onClick={() => setResult(null)} className="btn btn-quiet btn-sm">
                  Discard
                </button>
              </div>
            ) : null}
          </div>

          {result.status !== 'valid' && result.problems.length ? (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
              <p className="font-medium text-danger">Why this route doesn’t work</p>
              <ul className="mt-2 space-y-1.5">
                {result.problems.slice(0, 5).map((p) => (
                  <li key={p.id}>{p.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Consequences title="What changes" empty="No other courses change.">
              {[
                ...result.comparison.diff.added.map((p) => `Adds ${catalog.courses.get(p.courseId)!.name} (${placementPhrase(p.term, catalog.courses.get(p.courseId)!.durationTerms)})`),
                ...result.comparison.diff.removed.map((p) => `Removes ${catalog.courses.get(p.courseId)!.name}`),
                ...result.comparison.diff.moved.map((m) => `Moves ${catalog.courses.get(m.courseId)!.name} to ${placementPhrase(m.toTerm, catalog.courses.get(m.courseId)!.durationTerms)}`),
              ]}
            </Consequences>
            <Consequences title="Prerequisites" empty="No prerequisite changes.">
              {result.comparison.prerequisiteEffects.map((e) => e.text)}
            </Consequences>
            <Consequences title="Requirements" empty="Every requirement is covered the same way.">
              {result.comparison.requirementChanges.map((c) => `${c.name}: ${c.before.covered} → ${c.after.covered} of ${c.required} credits planned${c.after.status === 'missing' ? ' (missing)' : ''}`)}
            </Consequences>
            <Consequences title="Downstream" empty="Nothing else moves.">
              {result.comparison.downstream.map((d) => d.text)}
            </Consequences>
          </div>

          <section aria-labelledby="workload-title" className="surface mt-4 p-5">
            <h3 id="workload-title" className="eyebrow">
              Workload by semester
            </h3>
            <div className="mt-4 grid grid-cols-4 gap-4 md:grid-cols-8">
              {result.comparison.workload.map((w) => {
                const max = 28
                return (
                  <div key={w.term} className="text-center">
                    <div className="flex h-20 items-end justify-center gap-1" aria-label={`${termLabel(w.term)}: workload ${w.before} now, ${w.after} this way`} role="img">
                      <span className="w-3 rounded-t bg-white/20" style={{ height: `${(w.before / max) * 100}%` }} />
                      <span className="w-3 rounded-t bg-signal" style={{ height: `${(w.after / max) * 100}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-fog">{termLabel(w.term).replace(' ', ' ')}</p>
                    <p className={`text-[11px] tabular ${w.after > w.before ? 'text-warn' : w.after < w.before ? 'text-ok' : 'text-fog'}`}>
                      {w.after === w.before ? '—' : `${w.after > w.before ? '+' : ''}${w.after - w.before}`}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 flex items-center gap-4 text-xs text-fog">
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-white/20" /> Current plan</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-signal" /> This route</span>
              <span>From the catalog’s workload estimates.</span>
            </p>
          </section>

          <div className="mt-6 grid gap-4 2xl:grid-cols-2">
            <div className="surface p-3">
              <p className="px-2 pb-2 text-sm text-mist">Current plan</p>
              <PathMap catalog={catalog} placements={placements} startTerm={startTerm} changed={changedBefore} compact label="Current plan" />
            </div>
            <div className="surface p-3">
              <p className="px-2 pb-2 text-sm text-mist">This route</p>
              <PathMap catalog={catalog} placements={result.plan.placements} startTerm={startTerm} findings={result.validation.findings} changed={changedAfter} compact label="Alternative plan" />
            </div>
          </div>
        </section>
      ) : (
        <p className="mt-8 flex items-center gap-2 text-sm text-fog">
          <IconCheckCircle size={14} /> Compass shows what changes. It doesn’t rank routes — that choice is yours. <Link href="/plan" className="link">Back to My Plan</Link>
        </p>
      )}
    </div>
  )
}

function Consequences({ title, empty, children }: { title: string; empty: string; children: string[] }) {
  return (
    <div className="surface p-5">
      <h3 className="eyebrow">{title}</h3>
      {children.length ? (
        <ul className="mt-3 space-y-2 text-sm text-mist">
          {children.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-fog">{empty}</p>
      )}
    </div>
  )
}
