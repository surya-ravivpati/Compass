'use client'

import { useMemo, useState } from 'react'
import { addOption, placementPhrase, termLabel, type Catalog, type Placement, type PlanEdit } from '@/lib/engine'
import { Dialog } from '@/components/ui/dialog'
import { IconPlus, IconSearch } from '@/components/ui/icons'

export function AddCourseDialog({
  open,
  onClose,
  catalog,
  startTerm,
  placements,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  catalog: Catalog
  startTerm: number
  placements: Placement[]
  onEdit: (edit: PlanEdit) => void
}) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState(Math.min(7, startTerm))
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const plan = { placements }
    return [...catalog.courses.values()]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)))
      .map((c) => {
        const start = c.durationTerms === 2 && term % 2 === 1 ? term - 1 : term
        return { course: c, start, option: addOption(catalog, { startTerm }, plan, c, start) }
      })
      .sort((a, b) => Number(b.option.ok) - Number(a.option.ok) || a.course.name.localeCompare(b.course.name))
      .slice(0, 40)
  }, [query, term, catalog, placements, startTerm])
  return (
    <Dialog open={open} onClose={onClose} title="Add a course" description="Courses are checked against prerequisites, grade levels, seasons, and course load before you add them." wide>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
          <input className="field pl-9" placeholder="Search by name or interest" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" autoFocus />
        </div>
        <select className="field" value={term} onChange={(e) => setTerm(Number(e.target.value))} aria-label="Term">
          {Array.from({ length: 8 - startTerm }, (_, i) => startTerm + i).map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {results.map(({ course, start, option }) => (
          <li key={course.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">{course.name}</p>
              <p className="text-xs text-fog">
                {catalog.departments.get(course.department)?.name} · {course.durationTerms === 2 ? 'Full year' : 'Semester'} · {course.credits} cr
              </p>
            </div>
            {option.ok ? (
              <span className="flex shrink-0 items-center gap-2">
              {option.crowded ? <span className="text-xs text-warn">Full · adjustments needed</span> : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0"
                onClick={() => {
                  onEdit({ kind: 'add', courseId: course.id, term: start })
                  onClose()
                }}
                aria-label={`Add ${course.name} in ${placementPhrase(start, course.durationTerms)}`}
              >
                <IconPlus size={14} /> Add
              </button>
              </span>
            ) : (
              <span className="shrink-0 text-xs text-fog">{option.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
