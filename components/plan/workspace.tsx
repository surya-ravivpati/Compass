'use client'

import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  analyzeWorkload,
  buildCatalog,
  moveOptions,
  previewEdit,
  validatePlan,
  type EditPreview,
  type Placement,
  type PlacementReason,
  type PlanEdit,
  type Preferences,
  type SchoolConfig,
} from '@/lib/engine'
import { commitPlanAction, deletePlanAction, duplicatePlanAction, makePrimaryAction, restoreVersionAction } from '@/app/(app)/plan/actions'
import { PathMap, type DropHint } from '@/components/map/path-map'
import { keyOf, parseKey } from '@/components/map/layout'
import { Dialog } from '@/components/ui/dialog'
import { IconHistory, IconLayers, IconMap, IconPlus, IconUndo, IconX } from '@/components/ui/icons'
import { StatusIcon } from '@/components/ui/status'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { AddCourseDialog } from './add-course-dialog'
import { HistoryDialog, type VersionItem } from './history-dialog'
import { Inspector } from './inspector'
import { PendingBar } from './pending-bar'
import { PlanList } from './plan-list'
import { PlanComparisonView } from './plan-comparison'
import { PlanStatus } from './plan-status'

interface PlanSummaryItem {
  id: string
  name: string
  kind: 'primary' | 'alternative'
}

export interface WorkspaceProps {
  school: SchoolConfig
  startTerm: number
  preferences: Preferences
  planId: string
  planName: string
  planKind: 'primary' | 'alternative'
  version: number
  placements: Placement[]
  reasons: Record<string, PlacementReason[]>
  plans: PlanSummaryItem[]
  versions: VersionItem[]
  initialSelected?: string | null
  /** A move proposed elsewhere (Compass AI): staged for review, never applied on load. */
  initialPreview?: { courseId: string; toTerm: number } | null
  /** When viewing an alternative: the primary plan, for comparison. */
  primary?: { name: string; placements: Placement[] } | null
}

type Toast = { message: string; undo?: () => void; tone?: 'error' }

export function PlanWorkspace(props: WorkspaceProps) {
  const router = useRouter()
  const catalog = useMemo(() => buildCatalog(props.school), [props.school])
  const student = useMemo(() => ({ startTerm: props.startTerm }), [props.startTerm])
  const [placements, setPlacements] = useState(props.placements)
  const [reasons, setReasons] = useState(props.reasons)
  const [version, setVersion] = useState(props.version)
  const [selected, setSelected] = useState<string | null>(props.initialSelected ?? null)
  const [pending, setPending] = useState<EditPreview | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropHints, setDropHints] = useState<Map<number, DropHint>>(new Map())
  const [toast, setToast] = useState<Toast | null>(null)
  const narrow = useMediaQuery('(max-width: 1023px)')
  const [viewChoice, setView] = useState<'map' | 'list' | null>(null)
  const view = viewChoice ?? (narrow ? 'list' : 'map')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const plan = useMemo(() => ({ placements }), [placements])
  const validation = useMemo(() => validatePlan(catalog, student, plan, props.preferences), [catalog, student, plan, props.preferences])
  const workload = useMemo(() => analyzeWorkload(catalog, plan, props.preferences), [catalog, plan, props.preferences])

  const showToast = useCallback((t: Toast) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }, [])

  // The undo action calls the latest `commit`, which is declared below.
  const commitRef = useRef<(next: Placement[], summary: string, change: Record<string, unknown>, opts?: { undoable?: boolean }) => void>(() => {})

  /** Saves a plan state as a new version, optimistically. */
  const commit = useCallback(
    (next: Placement[], summary: string, change: Record<string, unknown>, opts: { undoable?: boolean } = {}) => {
      const before = placements
      const beforeReasons = reasons
      const prevKeys = new Set(before.map(keyOf))
      const nextReasons: Record<string, PlacementReason[]> = {}
      for (const p of next) {
        const k = keyOf(p)
        nextReasons[k] = prevKeys.has(k) && reasons[k] ? reasons[k]! : [{ kind: 'pinned', text: 'You placed this course here.' }]
      }
      setPlacements(next)
      setReasons(nextReasons)
      setPending(null)
      startTransition(async () => {
        const res = await commitPlanAction({
          planId: props.planId,
          baseVersion: version,
          placements: next.filter((p) => p.status === 'planned').map((p) => ({ courseId: p.courseId, term: p.term })),
          summary,
          change,
          reasons: Object.fromEntries(Object.entries(nextReasons).filter(([k]) => next.some((p) => p.status === 'planned' && keyOf(p) === k))),
        })
        if (!res.ok) {
          setPlacements(before)
          setReasons(beforeReasons)
          showToast({ message: res.error, tone: 'error' })
          if (res.conflict) router.refresh()
          return
        }
        setVersion(res.version)
        showToast({
          message: `${summary} · saved as v${res.version}`,
          ...(opts.undoable !== false
            ? { undo: () => commitRef.current(before, `Undid: ${summary}`, { kind: 'undo', of: res.version }, { undoable: false }) }
            : {}),
        })
        router.refresh()
      })
    },
    [placements, reasons, props.planId, version, router, showToast],
  )

  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  // A proposal opened from Compass AI is always staged for the student to review.
  const proposal = props.initialPreview
  const [stagedProposal, setStagedProposal] = useState(false)
  if (proposal && !stagedProposal) {
    setStagedProposal(true)
    const placement = placements.find((p) => p.courseId === proposal.courseId && p.status === 'planned')
    if (placement && placement.term !== proposal.toTerm) {
      try {
        setPending(previewEdit(catalog, student, plan, { kind: 'move', courseId: proposal.courseId, fromTerm: placement.term, toTerm: proposal.toTerm }, props.preferences))
      } catch {
        // An invalid proposal is simply not staged.
      }
    }
  }

  /** Every edit is previewed first; only clean edits apply straight away. */
  const requestEdit = useCallback(
    (edit: PlanEdit) => {
      let preview: EditPreview
      try {
        preview = previewEdit(catalog, student, plan, edit, props.preferences)
      } catch {
        showToast({ message: 'Compass couldn’t validate this change right now. Your existing plan has not been modified.', tone: 'error' })
        return
      }
      if (preview.introduced.length === 0) {
        const nextSelected = edit.kind === 'move' ? `${edit.courseId}@${edit.toTerm}` : edit.kind === 'replace' ? `${edit.withCourseId}@${edit.toTerm ?? edit.term}` : edit.kind === 'add' ? `${edit.courseId}@${edit.term}` : null
        commit(preview.plan.placements, preview.summary, { kind: 'edit', edit })
        setSelected(nextSelected)
        return
      }
      setPending(preview)
    },
    [catalog, student, plan, props.preferences, commit, showToast],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }))

  const onDragStart = (e: DragStartEvent) => {
    const key = String(e.active.id)
    const { courseId, term } = parseKey(key)
    const placement = placements.find((p) => p.courseId === courseId && p.term === term)
    if (!placement) return
    const course = catalog.courses.get(courseId)!
    const hints = new Map<number, DropHint>()
    for (const option of moveOptions(catalog, student, plan, placement)) {
      const hint: DropHint = { ok: option.ok, ...(option.reason ? { reason: option.reason } : {}), ...(option.crowded ? { crowded: true } : {}) }
      hints.set(option.term, hint)
      if (course.durationTerms === 2) hints.set(option.term + 1, hint)
    }
    if (course.durationTerms === 2) hints.set(term + 1, { ok: false, reason: 'Current year' })
    hints.set(term, { ok: false, reason: 'Current term' })
    setDropHints(hints)
    setDragging(key)
    setSelected(key)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const key = String(e.active.id)
    setDragging(null)
    const target = e.over?.data.current?.term as number | undefined
    if (target === undefined) return
    const { courseId, term } = parseKey(key)
    const course = catalog.courses.get(courseId)!
    const to = course.durationTerms === 2 && target % 2 === 1 ? target - 1 : target
    if (to === term) return
    const hint = dropHints.get(to)
    if (!hint?.ok) {
      showToast({ message: `${course.name} can’t go there: ${hint?.reason ?? 'not available'}.` })
      return
    }
    requestEdit({ kind: 'move', courseId, fromTerm: term, toTerm: to })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const { courseId, term } = parseKey(selected)
    const placement = placements.find((p) => p.courseId === courseId && p.term === term)
    if (!placement || placement.status !== 'planned') return
    const course = catalog.courses.get(courseId)!
    const step = course.durationTerms === 2 ? 2 : 1
    const to = term + (e.key === 'ArrowRight' ? step : -step)
    if (to < props.startTerm || to > 7) return
    e.preventDefault()
    requestEdit({ kind: 'move', courseId, fromTerm: term, toTerm: to })
  }

  const select = (key: string | null) => {
    setSelected(key)
    if (key && narrow) setSheetOpen(true)
  }

  const restore = (versionId: string) => {
    setHistoryOpen(false)
    startTransition(async () => {
      const res = await restoreVersionAction({ planId: props.planId, versionId, baseVersion: version })
      if (!res.ok) {
        showToast({ message: res.error, tone: 'error' })
        return
      }
      const history = placements.filter((p) => p.status !== 'planned')
      setPlacements([...history, ...(res.placements ?? [])])
      setReasons(res.reasons ?? {})
      setVersion(res.version)
      showToast({ message: `Restored · saved as v${res.version}` })
      router.refresh()
    })
  }

  const errors = validation.findings.filter((f) => f.severity === 'error')
  const warnings = validation.findings.filter((f) => f.severity === 'warning')

  const inspector = selected ? (
    <Inspector
      catalog={catalog}
      startTerm={props.startTerm}
      placements={placements}
      validation={validation}
      reasons={reasons}
      selected={selected}
      onEdit={(edit) => {
        setSheetOpen(false)
        requestEdit(edit)
      }}
      onClose={() => {
        setSelected(null)
        setSheetOpen(false)
      }}
      onSelect={setSelected}
    />
  ) : null

  return (
    <div onKeyDown={onKeyDown}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{props.planKind === 'primary' ? 'Primary plan' : 'Alternative plan'}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <h1 className="text-[26px] font-semibold md:text-[30px]">{props.planName}</h1>
            <span className="rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-mist" aria-label={`Version ${version}`}>
              v{version}
            </span>
            {busy ? <span className="text-xs text-fog">Saving…</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.plans.length > 1 ? (
            <select
              className="field h-9 w-auto text-sm"
              value={props.planId}
              aria-label="Switch plan"
              onChange={(e) => router.push(`/plan?plan=${e.target.value}` as Route)}
            >
              {props.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.kind === 'primary' ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')} className={`btn btn-sm h-7 ${view === 'map' ? 'bg-white/10 text-ink' : 'text-mist'}`}>
              <IconMap size={14} /> Map
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`btn btn-sm h-7 ${view === 'list' ? 'bg-white/10 text-ink' : 'text-mist'}`}>
              <IconLayers size={14} /> List
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}>
            <IconPlus size={14} /> Add course
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(true)}>
            <IconHistory size={14} /> History
          </button>
          <form
            action={async () => {
              const res = await duplicatePlanAction({ planId: props.planId, name: `${props.planName} (copy)` })
              if (res && !res.ok) showToast({ message: res.error, tone: 'error' })
            }}
          >
            <button type="submit" className="btn btn-quiet btn-sm">
              Duplicate
            </button>
          </form>
          {props.planKind === 'alternative' ? (
            <>
              {props.primary ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompareOpen(true)}>
                  Compare with primary
                </button>
              ) : null}
              <form action={() => makePrimaryAction(props.planId)}>
                <button type="submit" className="btn btn-quiet btn-sm">
                  Make primary
                </button>
              </form>
              <form action={() => deletePlanAction(props.planId)}>
                <button type="submit" className="btn btn-quiet btn-sm text-danger">
                  Delete
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>

      <section aria-label="Plan status" className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line px-4 py-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <StatusIcon status={validation.graduationPathValid ? 'valid' : 'invalid'} />
          Graduation path: {validation.graduationPathValid ? 'Valid' : 'Not valid yet'}
        </span>
        {validation.checks
          .filter((c) => ['requirements', 'prerequisites', 'availability', 'reachability'].includes(c.id))
          .map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-mist">
              <StatusIcon status={c.status} size={14} />
              {c.label}
            </span>
          ))}
        <span className="ml-auto text-xs text-fog">
          {errors.length ? `${errors.length} conflict${errors.length === 1 ? '' : 's'}` : 'No conflicts'}
          {warnings.length ? ` · ${warnings.length} to review` : ''}
          <span className="hidden lg:inline"> · Drag a course, or select it and press Alt + ←/→</span>
        </span>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'map' ? (
            <div className="surface p-2 md:p-3">
              <DndContext id="plan-map" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
                <PathMap
                  catalog={catalog}
                  placements={placements}
                  startTerm={props.startTerm}
                  findings={validation.findings}
                  selected={selected}
                  onSelect={select}
                  interactive
                  dragging={dragging}
                  dropHints={dropHints}
                />
              </DndContext>
            </div>
          ) : (
            <PlanList catalog={catalog} placements={placements} findings={validation.findings} selected={selected} onSelect={(k) => select(k)} />
          )}
        </div>

        <aside aria-label="Details" className="hidden lg:block">
          <div className="surface sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto p-5">
            {(!narrow && inspector) || (
              <PlanSummaryPanel validation={validation} notes={workload.notes.map((n) => n.text)} onFix={(edit) => requestEdit(edit)} />
            )}
          </div>
        </aside>
      </div>

      <div className="mt-5 lg:hidden">
        <div className="surface p-5">
          <PlanSummaryPanel validation={validation} notes={workload.notes.map((n) => n.text)} onFix={(edit) => requestEdit(edit)} />
        </div>
      </div>

      <Dialog open={narrow && sheetOpen && !!selected} onClose={() => setSheetOpen(false)} title="Course details">
        {narrow && sheetOpen ? inspector : null}
      </Dialog>

      {props.primary ? (
        <Dialog open={compareOpen} onClose={() => setCompareOpen(false)} title={`${props.planName} compared with ${props.primary.name}`} description="What this alternative changes. Compass shows the differences; it doesn’t rank them." wide>
          <PlanComparisonView catalog={catalog} startTerm={props.startTerm} preferences={props.preferences} primary={props.primary.placements} alternative={placements} />
        </Dialog>
      ) : null}

      <AddCourseDialog open={addOpen} onClose={() => setAddOpen(false)} catalog={catalog} startTerm={props.startTerm} placements={placements} onEdit={requestEdit} />
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        catalog={catalog}
        versions={props.versions}
        current={placements}
        currentVersion={version}
        onRestore={restore}
      />

      {pending ? (
        <PendingBar
          catalog={catalog}
          preview={pending}
          busy={busy}
          onApplyCascade={() =>
            pending.cascade &&
            commit(pending.cascade.plan.placements, `${pending.summary}, with adjustments`, { kind: 'edit', edit: pending.edit, cascade: pending.cascade.changes })
          }
          onKeep={() => commit(pending.plan.placements, pending.summary, { kind: 'edit', edit: pending.edit, keptConflicts: true })}
          onRevert={() => setPending(null)}
        />
      ) : null}

      {toast && !pending ? (
        <div role="status" className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 animate-rise items-center gap-3 rounded-xl border border-line-strong bg-graphite px-4 py-2.5 text-sm shadow-2xl lg:bottom-6">
          <span className={toast.tone === 'error' ? 'text-danger' : ''}>{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm text-signal-hi"
              onClick={() => {
                const undo = toast.undo!
                setToast(null)
                undo()
              }}
            >
              <IconUndo size={14} /> Undo
            </button>
          ) : null}
          <button type="button" className="btn btn-quiet btn-sm -mr-2" aria-label="Dismiss" onClick={() => setToast(null)}>
            <IconX size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PlanSummaryPanel({
  validation,
  notes,
  onFix,
}: {
  validation: ReturnType<typeof validatePlan>
  notes: string[]
  onFix: (edit: PlanEdit) => void
}) {
  const issues = validation.findings.filter((f) => f.severity !== 'info')
  return (
    <div>
      <PlanStatus validation={validation} />
      <div className="mt-6 border-t border-line pt-5">
        <h2 className="eyebrow">{issues.length ? 'Needs your attention' : 'Checks'}</h2>
        {issues.length ? (
          <ul className="mt-3 space-y-3">
            {issues.slice(0, 8).map((f) => (
              <li key={f.id} className="text-sm">
                <p className="flex gap-2">
                  <StatusIcon status={f.severity === 'error' ? 'invalid' : 'attention'} size={15} />
                  <span className="text-mist">{f.message}</span>
                </p>
                {f.fixes?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                    {f.fixes.slice(0, 2).map((fix) => (
                      <button
                        key={fix.label}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          onFix(
                            fix.kind === 'move'
                              ? { kind: 'move', courseId: fix.courseId, fromTerm: fix.fromTerm, toTerm: fix.toTerm }
                              : fix.kind === 'add'
                                ? { kind: 'add', courseId: fix.courseId, term: fix.term }
                                : { kind: 'remove', courseId: fix.courseId, term: fix.term },
                          )
                        }
                      >
                        {fix.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-mist">Every course is in order. Select a course to see why it’s there, what it needs, and what it opens.</p>
        )}
      </div>
      {notes.length ? (
        <div className="mt-6 border-t border-line pt-5">
          <h2 className="eyebrow">Workload tradeoffs</h2>
          <ul className="mt-3 space-y-2 text-[13px] text-mist">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-6 text-xs text-fog">
        Want to try a different route without changing this plan? <Link href="/what-if" className="link">Open What If?</Link>
      </p>
    </div>
  )
}
