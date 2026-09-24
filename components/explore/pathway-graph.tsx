'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useMemo, useState } from 'react'
import { prerequisiteDepths, prerequisiteIds, type Catalog, type Course } from '@/lib/engine'

export type NodeState = 'completed' | 'in-progress' | 'planned' | 'available' | 'unreachable' | 'covered'

const NODE_W = 188
const NODE_H = 50
const COL_GAP = 56
const ROW_GAP = 12

/**
 * A department's courses as a prerequisite graph, laid out left to right by
 * depth. Positions are computed, not measured, so the drawing is stable.
 */
export function PathwayGraph({
  catalog,
  department,
  states,
  labels,
  taken,
}: {
  catalog: Catalog
  department: string
  states: Map<string, NodeState>
  labels: Map<string, string>
  /** Courses completed, in progress, or planned: their prerequisites needn't be flagged. */
  taken: Set<string>
}) {
  const [hover, setHover] = useState<string | null>(null)
  const layout = useMemo(() => {
    const courses = [...catalog.courses.values()].filter((c) => c.department === department)
    const ids = new Set(courses.map((c) => c.id))
    const depth = prerequisiteDepths(catalog, ids)
    const columns = new Map<number, Course[]>()
    for (const c of courses) {
      const d = depth.get(c.id) ?? 0
      columns.set(d, [...(columns.get(d) ?? []), c])
    }
    // Order each column by the average row of its prerequisites (barycenter),
    // so edges mostly run straight across instead of crossing.
    const ordered = [...columns.entries()].sort((a, b) => a[0] - b[0])
    const row = new Map<string, number>()
    for (const [, list] of ordered) {
      const bary = (c: Course) => {
        const rows = prerequisiteIds(c).filter((p) => row.has(p)).map((p) => row.get(p)!)
        return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity
      }
      list.sort((a, b) => bary(a) - bary(b) || a.name.localeCompare(b.name))
      list.forEach((c, i) => row.set(c.id, i))
    }
    const pos = new Map<string, { x: number; y: number }>()
    let height = 0
    for (const [d, list] of ordered) {
      list.forEach((c, i) => pos.set(c.id, { x: d * (NODE_W + COL_GAP), y: i * (NODE_H + ROW_GAP) }))
      height = Math.max(height, list.length * (NODE_H + ROW_GAP))
    }
    const width = (Math.max(0, ...columns.keys()) + 1) * (NODE_W + COL_GAP) - COL_GAP
    const edges = courses.flatMap((c) =>
      prerequisiteIds(c)
        .filter((p) => ids.has(p))
        .map((p) => ({ from: p, to: c.id })),
    )
    // Prerequisites from other departments, shown only while still unmet.
    const outside = new Map(
      courses.map((c) => [
        c.id,
        c.prerequisites
          .filter((g) => g.anyOf.every((o) => !ids.has(o.courseId)) && !g.anyOf.some((o) => taken.has(o.courseId)))
          .map((g) => catalog.courses.get(g.anyOf[0]!.courseId)?.name ?? g.anyOf[0]!.courseId),
      ]),
    )
    return { courses, pos, width, height, edges, outside }
  }, [catalog, department, taken])

  const related = useMemo(() => {
    if (!hover) return null
    const out = new Set<string>([hover])
    const up = (id: string) => layout.edges.filter((e) => e.to === id).forEach((e) => { if (!out.has(e.from)) { out.add(e.from); up(e.from) } })
    const down = (id: string) => layout.edges.filter((e) => e.from === id).forEach((e) => { if (!out.has(e.to)) { out.add(e.to); down(e.to) } })
    up(hover)
    down(hover)
    return out
  }, [hover, layout.edges])

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map((e) => {
            const a = layout.pos.get(e.from)!
            const b = layout.pos.get(e.to)!
            const x1 = a.x + NODE_W
            const y1 = a.y + NODE_H / 2
            const x2 = b.x
            const y2 = b.y + NODE_H / 2
            const dx = (x2 - x1) / 2
            const on = related ? related.has(e.from) && related.has(e.to) : false
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={on ? '#2F8CFF' : 'rgba(255,255,255,0.16)'}
                strokeWidth={on ? 1.6 : 1}
                style={{ opacity: related && !on ? 0.25 : 1, transition: 'opacity 200ms' }}
              />
            )
          })}
        </svg>
        {layout.courses.map((c) => {
          const p = layout.pos.get(c.id)!
          const state = states.get(c.id) ?? 'available'
          const dim = related && !related.has(c.id)
          const outside = layout.outside.get(c.id) ?? []
          return (
            <Link
              key={c.id}
              href={`/explore/${c.id}` as Route}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)}
              onBlur={() => setHover(null)}
              className={`absolute flex flex-col justify-center rounded-[9px] border px-2.5 transition-opacity duration-200 ${
                state === 'completed' || state === 'in-progress'
                  ? 'border-signal-line bg-signal-soft'
                  : state === 'planned'
                    ? 'border-signal/70 bg-obsidian'
                    : state === 'unreachable' || state === 'covered'
                      ? 'border-line bg-transparent text-fog'
                      : 'border-line-strong bg-obsidian hover:bg-graphite'
              } ${dim ? 'opacity-30' : ''}`}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              aria-label={`${c.name}: ${labels.get(c.id) ?? state}${outside.length ? `. Also needs ${outside.join(', ')}` : ''}`}
            >
              <span className="truncate text-[12.5px] font-medium">{c.name}</span>
              <span className="truncate text-[11px] text-fog">
                {labels.get(c.id)}
                {outside.length ? ` · needs ${outside[0]}${outside.length > 1 ? '…' : ''}` : ''}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
