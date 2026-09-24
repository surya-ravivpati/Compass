import {
  evaluatePrerequisites,
  indexSpans,
  occupiedTerms,
  type Catalog,
  type Course,
  type Placement,
} from '@/lib/engine'

export const keyOf = (p: Pick<Placement, 'courseId' | 'term'>) => `${p.courseId}@${p.term}`

export function parseKey(key: string): { courseId: string; term: number } {
  const at = key.lastIndexOf('@')
  return { courseId: key.slice(0, at), term: Number(key.slice(at + 1)) }
}

/** Grid column for a term: label, before-high-school, then years with spacers between them. */
export function columnOf(term: number): number {
  if (term < 0) return 2
  return 4 + term + Math.floor(term / 2)
}

export const GRID_TEMPLATE =
  'minmax(76px, 104px) minmax(84px, 108px) 8px minmax(0,1fr) minmax(0,1fr) 8px minmax(0,1fr) minmax(0,1fr) 8px minmax(0,1fr) minmax(0,1fr) 8px minmax(0,1fr) minmax(0,1fr)'

export interface MapCell {
  key: string
  placement: Placement
  course: Course
  row: number
  column: number
  span: number
}

export interface RowGroup {
  id: string
  label: string
  startRow: number
  rows: number
}

export interface MapLayout {
  cells: MapCell[]
  groups: RowGroup[]
  totalRows: number
  hasPreHighSchool: boolean
}

/**
 * Places every course in a lane (one per core department, then electives),
 * packing each lane into as few rows as it needs. A full-year course spans
 * both semesters of its year.
 */
export function layoutPlan(catalog: Catalog, placements: Placement[]): MapLayout {
  const lanes = [...catalog.school.departments].filter((d) => d.lane).sort((a, b) => a.order - b.order)
  const laneIds = new Set(lanes.map((l) => l.id))
  const groupsSpec = [
    ...lanes.map((l) => ({ id: l.id, label: l.name })),
    { id: '__electives', label: 'Electives & more' },
  ]
  const byGroup = new Map<string, Placement[]>(groupsSpec.map((g) => [g.id, []]))
  for (const p of placements) {
    const course = catalog.courses.get(p.courseId)
    if (!course) continue
    const group = laneIds.has(course.department) ? course.department : '__electives'
    byGroup.get(group)!.push(p)
  }

  const cells: MapCell[] = []
  const groups: RowGroup[] = []
  let row = 2 // row 1 is the header
  for (const spec of groupsSpec) {
    const items = byGroup
      .get(spec.id)!
      .map((p) => ({ p, course: catalog.courses.get(p.courseId)! }))
      .sort(
        (a, b) =>
          a.p.term - b.p.term ||
          b.course.durationTerms - a.course.durationTerms ||
          laneRank(catalog, a.course) - laneRank(catalog, b.course) ||
          a.course.name.localeCompare(b.course.name),
      )
    const occupied: Set<number>[] = []
    for (const { p, course } of items) {
      const slots = p.term < 0 ? [-1] : occupiedTerms(p.term, course.durationTerms)
      let r = 0
      while (occupied[r] && slots.some((s) => occupied[r]!.has(s))) r++
      occupied[r] ??= new Set()
      for (const s of slots) occupied[r]!.add(s)
      cells.push({
        key: keyOf(p),
        placement: p,
        course,
        row: row + r,
        column: columnOf(p.term),
        span: p.term < 0 ? 1 : course.durationTerms === 2 ? 2 : 1,
      })
    }
    const rows = Math.max(1, occupied.length)
    if (spec.id !== '__electives' || items.length > 0) {
      groups.push({ id: spec.id, label: spec.label, startRow: row, rows })
      row += rows
    }
  }
  return { cells, groups, totalRows: row - 1, hasPreHighSchool: placements.some((p) => p.term < 0) }
}

function laneRank(catalog: Catalog, course: Course): number {
  return catalog.departments.get(course.department)?.order ?? 99
}

export interface Edge {
  from: string
  to: string
  concurrent: boolean
}

/** Prerequisite links that the plan actually uses: which placement satisfies which. */
export function planEdges(catalog: Catalog, placements: Placement[]): Edge[] {
  const spans = indexSpans(catalog, placements)
  const edges: Edge[] = []
  for (const p of placements) {
    const course = catalog.courses.get(p.courseId)
    if (!course || course.prerequisites.length === 0 || p.term < 0) continue
    const result = evaluatePrerequisites(course, p.term, spans)
    for (const g of result.groups) {
      if (!g.match) continue
      edges.push({ from: keyOf({ courseId: g.match.span.courseId, term: g.match.span.start }), to: keyOf(p), concurrent: g.match.how === 'concurrent' })
    }
  }
  return edges
}

/** Keys upstream and downstream of `key` through the plan's own edges. */
export function relatives(edges: Edge[], key: string): { before: Set<string>; after: Set<string> } {
  const walk = (start: string, dir: 'up' | 'down') => {
    const out = new Set<string>()
    const stack = [start]
    while (stack.length) {
      const k = stack.pop()!
      for (const e of edges) {
        const next = dir === 'up' ? (e.to === k ? e.from : null) : e.from === k ? e.to : null
        if (next && !out.has(next)) {
          out.add(next)
          stack.push(next)
        }
      }
    }
    return out
  }
  return { before: walk(key, 'up'), after: walk(key, 'down') }
}
