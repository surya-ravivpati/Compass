'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useMemo } from 'react'
import {
  explainPlacement,
  moveOptions,
  placementPhrase,
  replacementOptions,
  termLabel,
  whyNot,
  type Catalog,
  type Fix,
  type Placement,
  type PlacementReason,
  type PlanEdit,
  type ValidationReport,
} from '@/lib/engine'
import { IconArrowRight, IconBranch, IconTrash, IconX } from '@/components/ui/icons'
import { StatusIcon } from '@/components/ui/status'
import { parseKey } from '@/components/map/layout'

const LEVEL: Record<string, string> = { standard: 'Standard', honors: 'Honors', ap: 'AP', 'post-ap': 'College level' }
const WORKLOAD = ['', 'Light', 'Moderate', 'Heavy', 'Intense']

export function Inspector({
  catalog,
  startTerm,
  placements,
  validation,
  reasons,
  selected,
  onEdit,
  onClose,
  onSelect,
}: {
  catalog: Catalog
  startTerm: number
  placements: Placement[]
  validation: ValidationReport
  reasons: Record<string, PlacementReason[]>
  selected: string
  onEdit: (edit: PlanEdit) => void
  onClose: () => void
  onSelect: (key: string) => void
}) {
  const { courseId, term } = parseKey(selected)
  const placement = placements.find((p) => p.courseId === courseId && p.term === term)
  const course = catalog.courses.get(courseId)
  const plan = useMemo(() => ({ placements }), [placements])
  const student = useMemo(() => ({ startTerm }), [startTerm])

  const explanation = useMemo(
    () => (placement ? explainPlacement(catalog, student, plan, placement, { reasons: reasons[selected], progress: validation.progress }) : null),
    [catalog, student, plan, placement, reasons, selected, validation.progress],
  )
  const moves = useMemo(() => (placement && placement.status === 'planned' ? moveOptions(catalog, student, plan, placement) : []), [catalog, student, plan, placement])
  const replacements = useMemo(
    () => (placement && placement.status === 'planned' ? replacementOptions(catalog, student, plan, placement).slice(0, 8) : []),
    [catalog, student, plan, placement],
  )

  if (!placement || !course || !explanation) return null
  const findings = validation.findings.filter((f) => f.courseId === courseId && f.term === term && f.severity !== 'info')
  const why = placement.status === 'planned' ? whyNot(catalog, student, plan, courseId) : null
  const planned = placement.status === 'planned'

  const applyFix = (fix: Fix) => {
    if (fix.kind === 'move') onEdit({ kind: 'move', courseId: fix.courseId, fromTerm: fix.fromTerm, toTerm: fix.toTerm })
    if (fix.kind === 'remove') onEdit({ kind: 'remove', courseId: fix.courseId, term: fix.term })
    if (fix.kind === 'add') onEdit({ kind: 'add', courseId: fix.courseId, term: fix.term })
  }

  return (
    <div className="animate-fade">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{catalog.departments.get(course.department)?.name}</p>
          <h2 className="mt-1.5 text-[19px] font-semibold leading-snug">{course.name}</h2>
          <p className="mt-1 text-sm text-mist">
            {placement.term < 0 ? 'Before high school' : placementPhrase(placement.term, course.durationTerms)} ·{' '}
            {placement.status === 'completed' ? 'Completed' : placement.status === 'in-progress' ? 'In progress' : 'Planned'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn btn-quiet btn-sm -mr-2" aria-label="Close course details">
          <IconX />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
        <Fact label="Level" value={LEVEL[course.level] ?? course.level} />
        <Fact label="Credits" value={`${course.credits}`} />
        <Fact label="Workload" value={WORKLOAD[course.workload] ?? ''} />
      </dl>

      {findings.length ? (
        <section aria-label="Conflicts" className="mt-5 space-y-3">
          {findings.map((f) => (
            <div key={f.id} className={`rounded-xl border p-3.5 text-sm ${f.severity === 'error' ? 'border-danger/35 bg-danger-soft' : 'border-warn/30 bg-warn-soft'}`}>
              <p className="flex gap-2">
                <StatusIcon status={f.severity === 'error' ? 'invalid' : 'attention'} />
                <span>{f.message}</span>
              </p>
              {f.fixes?.length ? (
                <div className="mt-3">
                  <p className="text-xs text-mist">Possible adjustments</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.fixes.map((fix) => (
                      <button key={fix.label} type="button" onClick={() => applyFix(fix)} className="btn btn-ghost btn-sm">
                        {fix.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="why-title" className="mt-6">
        <h3 id="why-title" className="eyebrow">
          Why it’s here
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed">{explanation.headline}</p>
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-mist">
          {explanation.facts
            .filter((f) => f.kind !== 'history')
            .map((f) => (
              <li key={f.text} className="flex gap-2">
                <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${f.kind === 'consequence' ? 'bg-warn' : 'bg-fog'}`} />
                <span>{f.text}</span>
              </li>
            ))}
        </ul>
        <p className="mt-3 text-xs text-fog">
          Source: {course.source.document}
          {course.source.page ? `, page ${course.source.page}` : ''}
        </p>
      </section>

      {explanation.prerequisites.length || explanation.unlocks.length ? (
        <section aria-label="Before and after" className="mt-6 grid gap-4">
          {explanation.prerequisites.length ? (
            <div>
              <h3 className="eyebrow">Before</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {explanation.prerequisites.map((p) => (
                  <li key={p.label} className="flex items-start justify-between gap-3">
                    <span className="text-mist">{p.label}</span>
                    {p.satisfiedBy ? (
                      <button type="button" className="shrink-0 text-xs text-signal-hi hover:underline" onClick={() => onSelect(`${p.satisfiedBy!.courseId}@${p.satisfiedBy!.term}`)}>
                        {p.satisfiedBy.term < 0 ? 'Done' : termLabel(p.satisfiedBy.term)}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-danger">Missing</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {explanation.unlocks.length ? (
            <div>
              <h3 className="eyebrow">Opens</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {explanation.unlocks.map((u) => {
                  const name = catalog.courses.get(u.courseId)?.name ?? u.courseId
                  return u.term !== null ? (
                    <li key={u.courseId}>
                      <button type="button" onClick={() => onSelect(`${u.courseId}@${u.term}`)} className="rounded-md border border-signal-line bg-signal-soft px-2 py-1 text-xs text-ink">
                        {name}
                      </button>
                    </li>
                  ) : (
                    <li key={u.courseId}>
                      <Link href={`/explore/${u.courseId}` as Route} className="block rounded-md border border-line-strong px-2 py-1 text-xs text-mist hover:text-ink">
                        {name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {planned ? (
        <section aria-labelledby="change-title" className="mt-6 border-t border-line pt-5">
          <h3 id="change-title" className="eyebrow">
            Change it
          </h3>
          <label className="mt-3 block text-sm text-mist" htmlFor="move-select">
            Move to
          </label>
          <select
            id="move-select"
            className="field mt-1.5"
            value=""
            onChange={(e) => {
              const to = Number(e.target.value)
              if (!Number.isNaN(to)) onEdit({ kind: 'move', courseId, fromTerm: term, toTerm: to })
            }}
          >
            <option value="" disabled>
              Choose a term…
            </option>
            {moves.map((m) => (
              <option key={m.term} value={m.term} disabled={!m.ok}>
                {course.durationTerms === 2 ? placementPhrase(m.term, 2).replace(/^\w/, (c) => c.toUpperCase()) : termLabel(m.term)}
                {m.ok
                  ? m.crowded
                    ? ' — full; Compass will suggest adjustments'
                    : m.breaks.length
                      ? ` — affects ${m.breaks.join(', ')}`
                      : ''
                  : ` — ${m.reason}`}
              </option>
            ))}
          </select>

          {replacements.length ? (
            <>
              <label className="mt-4 block text-sm text-mist" htmlFor="replace-select">
                Replace with
              </label>
              <select
                id="replace-select"
                className="field mt-1.5"
                value=""
                onChange={(e) => e.target.value && onEdit({ kind: 'replace', courseId, term, withCourseId: e.target.value })}
              >
                <option value="" disabled>
                  Choose a course…
                </option>
                {replacements.map((r) => (
                  <option key={r.course.id} value={r.course.id}>
                    {r.course.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onEdit({ kind: 'remove', courseId, term })} className="btn btn-ghost btn-sm">
              <IconTrash size={14} /> Remove
            </button>
            <Link href={`/what-if?kind=drop&course=${courseId}` as Route} className="btn btn-ghost btn-sm">
              <IconBranch size={14} /> What if I drop it?
            </Link>
          </div>
          {why && why.earliestTerm !== null && why.earliestTerm < term ? (
            <p className="mt-4 text-xs text-fog">Earliest possible from where you are: {placementPhrase(why.earliestTerm, course.durationTerms)}.</p>
          ) : null}
        </section>
      ) : null}

      <Link href={`/explore/${course.id}` as Route} className="mt-6 inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink">
        Full course profile <IconArrowRight size={14} />
      </Link>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-obsidian px-2 py-2.5">
      <dt className="text-[11px] text-fog">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium">{value}</dd>
    </div>
  )
}
