'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  placementPhrase,
  seasonOfTerm,
  yearOfTerm,
  YEAR_NAMES,
  type Catalog,
  type Finding,
  type Placement,
} from '@/lib/engine'
import { IconAlert, IconBlocked, IconCheck } from '@/components/ui/icons'
import { columnOf, GRID_TEMPLATE, layoutPlan, planEdges, relatives, type MapCell } from './layout'

export type DropHint = { ok: boolean; reason?: string; crowded?: boolean }

export interface PathMapProps {
  catalog: Catalog
  placements: Placement[]
  startTerm: number
  findings?: Finding[]
  selected?: string | null
  onSelect?: (key: string | null) => void
  /** Keys to mark as changed (what-if comparisons). */
  changed?: Map<string, 'added' | 'moved'>
  /** Number of years shown, for the plan reveal (4 = all). */
  revealYears?: number
  /** Enables drag-and-drop; requires an enclosing DndContext. */
  interactive?: boolean
  dragging?: string | null
  dropHints?: Map<number, DropHint>
  compact?: boolean
  label?: string
  /** Animate cards in, year by year (the plan reveal). */
  animateIn?: boolean
}

export function PathMap({
  catalog,
  placements,
  startTerm,
  findings = [],
  selected = null,
  onSelect,
  changed,
  revealYears = 4,
  interactive = false,
  dragging = null,
  dropHints,
  compact = false,
  label = 'Four-year plan',
  animateIn = false,
}: PathMapProps) {
  const layout = useMemo(() => layoutPlan(catalog, placements), [catalog, placements])
  const edges = useMemo(() => planEdges(catalog, placements), [catalog, placements])
  const related = useMemo(() => (selected ? relatives(edges, selected) : null), [edges, selected])

  const problems = useMemo(() => {
    const map = new Map<string, 'error' | 'warning'>()
    for (const f of findings) {
      if (!f.courseId || f.term === undefined || f.severity === 'info') continue
      const key = `${f.courseId}@${f.term}`
      if (f.severity === 'error' || !map.has(key)) map.set(key, f.severity)
    }
    return map
  }, [findings])

  const containerRef = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<{ id: string; d: string; from: string; to: string }[]>([])

  const measure = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    const box = root.getBoundingClientRect()
    const rects = new Map<string, DOMRect>()
    root.querySelectorAll<HTMLElement>('[data-card-key]').forEach((el) => rects.set(el.dataset.cardKey!, el.getBoundingClientRect()))
    const next: typeof paths = []
    for (const e of edges) {
      const a = rects.get(e.from)
      const b = rects.get(e.to)
      if (!a || !b || e.concurrent) continue
      const x1 = a.right - box.left
      const y1 = a.top + a.height / 2 - box.top
      const x2 = b.left - box.left
      const y2 = b.top + b.height / 2 - box.top
      if (x2 <= x1) continue
      const dx = Math.max(14, (x2 - x1) * 0.5)
      next.push({ id: `${e.from}->${e.to}`, from: e.from, to: e.to, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` })
    }
    setPaths(next)
  }, [edges])

  useLayoutEffect(() => {
    measure()
    const root = containerRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(root)
    return () => observer.disconnect()
  }, [measure, revealYears])

  const visible = (cell: MapCell) => cell.placement.term < 0 || yearOfTerm(cell.placement.term) < revealYears

  return (
    <div className="relative overflow-x-auto">
      <div
        ref={containerRef}
        role="region"
        aria-label={label}
        className="relative grid min-w-[820px] gap-y-1.5"
        style={{ gridTemplateColumns: GRID_TEMPLATE, gridTemplateRows: `auto repeat(${layout.totalRows - 1}, minmax(${compact ? 40 : 52}px, auto))` }}
      >
        {/* Header */}
        <div className="col-start-1 row-start-1" />
        <div className="col-start-2 row-start-1 px-2 pb-2">
          <div className="eyebrow">Before</div>
          <div className="text-[11px] text-fog">high school</div>
        </div>
        {[0, 1, 2, 3].map((year) => (
          <div
            key={year}
            className="row-start-1 border-b border-line pb-2"
            style={{ gridColumn: `${columnOf(year * 2)} / span 2`, opacity: year < revealYears ? 1 : 0.25, transition: 'opacity 500ms' }}
          >
            <div className="flex items-baseline justify-between px-2">
              <span className="text-[13px] font-medium text-ink">{YEAR_NAMES[year]}</span>
              <span className="text-[11px] text-fog tabular">Grade {9 + year}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 px-2 text-[11px] text-fog">
              <span>Fall{year * 2 < startTerm ? ' · done' : ''}</span>
              <span>Spring</span>
            </div>
          </div>
        ))}

        {/* Past-term shading and drop zones */}
        {Array.from({ length: 8 }, (_, t) => (
          <TermColumn
            key={t}
            term={t}
            rows={layout.totalRows}
            past={t < startTerm}
            interactive={interactive}
            hint={dragging ? dropHints?.get(t) : undefined}
          />
        ))}

        {/* Lane labels */}
        {layout.groups.map((g) => (
          <div
            key={g.id}
            className="col-start-1 flex items-start border-t border-line pt-3 pr-2"
            style={{ gridRow: `${g.startRow} / span ${g.rows}` }}
          >
            <span className="text-[12px] font-medium leading-tight text-mist">{g.label}</span>
          </div>
        ))}

        {/* Course cards */}
        {layout.cells.map((cell) => {
          if (!visible(cell)) return null
          const state = selected
            ? cell.key === selected
              ? 'selected'
              : related?.before.has(cell.key)
                ? 'before'
                : related?.after.has(cell.key)
                  ? 'after'
                  : 'dim'
            : 'idle'
          const Card = interactive && cell.placement.status === 'planned' ? DraggableCard : StaticCard
          return (
            <div
              key={cell.key}
              className={`relative z-[2] px-[3px] py-[1px] ${animateIn ? 'animate-rise' : ''}`}
              style={{
                gridColumn: `${cell.column} / span ${cell.span === 2 ? 2 : 1}`,
                gridRow: cell.row,
                ...(animateIn ? { animationDelay: `${Math.max(0, cell.placement.term < 0 ? 0 : yearOfTerm(cell.placement.term)) * 60 + cell.row * 22}ms` } : {}),
              }}
            >
              <Card
                cell={cell}
                state={state}
                problem={problems.get(cell.key)}
                changed={changed?.get(cell.key)}
                onSelect={onSelect}
                compact={compact}
                isDragging={dragging === cell.key}
              />
            </div>
          )
        })}

        {/* Prerequisite edges */}
        <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible" aria-hidden="true">
          {paths.map((p) => {
            const active = selected && (p.to === selected || p.from === selected || (related?.before.has(p.from) && (related.before.has(p.to) || p.to === selected)) || (related?.after.has(p.to) && (related.after.has(p.from) || p.from === selected)))
            const shown = !selected || active
            const fromYear = yearOfTerm(Number(p.from.split('@').pop()))
            const toYear = yearOfTerm(Number(p.to.split('@').pop()))
            if (Math.max(fromYear, toYear) >= revealYears) return null
            return (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke={active ? '#2F8CFF' : 'rgba(255,255,255,0.14)'}
                strokeWidth={active ? 1.6 : 1}
                strokeDasharray={active ? undefined : '2 3'}
                style={{ opacity: shown ? 1 : 0.15, transition: 'opacity 240ms, stroke 240ms' }}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function TermColumn({
  term,
  rows,
  past,
  interactive,
  hint,
}: {
  term: number
  rows: number
  past: boolean
  interactive: boolean
  hint?: DropHint
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `term-${term}`, disabled: !interactive, data: { term } })
  const tint = hint
    ? hint.ok
      ? isOver
        ? 'bg-signal/[0.16] ring-1 ring-signal/60'
        : 'bg-signal/[0.06]'
      : 'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.035)_0_6px,transparent_6px_12px)]'
    : past
      ? 'bg-white/[0.015]'
      : ''
  return (
    <div
      ref={setNodeRef}
      className={`relative z-0 rounded-lg transition-colors duration-150 ${tint}`}
      style={{ gridColumn: columnOf(term), gridRow: `2 / span ${Math.max(1, rows - 1)}` }}
    >
      {hint && isOver ? (
        <span className={`absolute left-1/2 top-1 z-[3] -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] ${hint.ok ? 'bg-signal text-white' : 'bg-slate text-mist'}`}>
          {hint.ok ? `Move to ${seasonOfTerm(term) === 'fall' ? 'Fall' : 'Spring'}${hint.crowded ? ' · full, adjustments needed' : ''}` : hint.reason}
        </span>
      ) : null}
    </div>
  )
}

interface CardProps {
  cell: MapCell
  state: 'idle' | 'selected' | 'before' | 'after' | 'dim'
  problem?: 'error' | 'warning'
  changed?: 'added' | 'moved'
  onSelect?: (key: string | null) => void
  compact: boolean
  isDragging?: boolean
}

function StaticCard(props: CardProps) {
  return <CardBody {...props} />
}

function DraggableCard(props: CardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.cell.key })
  return (
    <CardBody
      {...props}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 } : undefined}
    />
  )
}

function CardBody({
  cell,
  state,
  problem,
  changed,
  onSelect,
  compact,
  isDragging,
  dragRef,
  dragProps,
  style,
}: CardProps & {
  dragRef?: (el: HTMLElement | null) => void
  dragProps?: Record<string, unknown>
  style?: React.CSSProperties
}) {
  const { course, placement } = cell
  const status = placement.status
  const where = placement.term < 0 ? 'before high school' : placementPhrase(placement.term, course.durationTerms)
  const meta = [
    course.durationTerms === 2 ? `${course.credits} cr` : `${seasonShort(placement.term)} · ${course.credits} cr`,
  ]
  const border =
    problem === 'error'
      ? 'border-danger/70'
      : state === 'selected'
        ? 'border-signal'
        : changed === 'added'
          ? 'border-signal border-dashed'
          : changed === 'moved'
            ? 'border-signal/70'
            : problem === 'warning'
              ? 'border-warn/50'
              : state === 'before' || state === 'after'
                ? 'border-signal-line'
                : 'border-line-strong'
  const bg =
    state === 'selected'
      ? 'bg-signal-soft'
      : status === 'completed'
        ? 'bg-white/[0.025]'
        : 'bg-obsidian hover:bg-graphite'
  const label = `${course.name}, ${where}, ${status === 'completed' ? 'completed' : status === 'in-progress' ? 'in progress' : 'planned'}, ${course.credits} credit${course.credits === 1 ? '' : 's'}${problem === 'error' ? ', has a conflict' : problem === 'warning' ? ', needs a look' : ''}`
  return (
    <button
      type="button"
      ref={dragRef}
      data-card-key={cell.key}
      {...dragProps}
      aria-label={label}
      aria-pressed={state === 'selected'}
      onClick={() => onSelect?.(state === 'selected' ? null : cell.key)}
      style={style}
      className={`group flex h-full w-full touch-none flex-col justify-between rounded-[9px] border text-left transition-[opacity,background-color,border-color,box-shadow] duration-200 ${border} ${bg} ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      } ${state === 'dim' ? 'opacity-35' : ''} ${isDragging ? 'shadow-2xl shadow-black/60 ring-1 ring-signal' : ''}`}
    >
      <span className={`line-clamp-3 font-medium leading-snug text-ink hyphens-auto [overflow-wrap:anywhere] ${compact ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
        {course.name}
      </span>
      {!compact ? (
        <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-fog">
          {problem === 'error' ? <IconBlocked size={12} className="text-danger" /> : null}
          {problem === 'warning' ? <IconAlert size={12} className="text-warn" /> : null}
          {status === 'completed' ? <IconCheck size={12} className="text-mist" /> : null}
          {status === 'in-progress' ? <span className="h-1.5 w-1.5 rounded-full bg-signal" /> : null}
          <span className="tabular">{meta.join(' · ')}</span>
        </span>
      ) : null}
    </button>
  )
}

function seasonShort(term: number): string {
  if (term < 0) return 'Done'
  return seasonOfTerm(term) === 'fall' ? 'Fall' : 'Spring'
}
