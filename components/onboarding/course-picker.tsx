'use client'

import { useId, useMemo, useState } from 'react'
import type { Course, GradeLevel } from '@/lib/engine'
import { IconPlus, IconSearch, IconX } from '@/components/ui/icons'

export interface PickedCourse {
  courseId: string
  term: number
}

/**
 * Pick the courses taken in one school year. Full-year courses sit in the
 * fall term; semester courses get a Fall / Spring choice.
 */
export function CoursePicker({
  courses,
  grade,
  value,
  onChange,
  label,
}: {
  courses: Course[]
  grade: GradeLevel
  value: PickedCourse[]
  onChange: (next: PickedCourse[]) => void
  label: string
}) {
  const [query, setQuery] = useState('')
  const listId = useId()
  const fall = (grade - 9) * 2
  const chosenIds = new Set(value.map((v) => v.courseId))
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return courses
      .filter((c) => !chosenIds.has(c.id) && c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.grades.includes(grade)) - Number(!b.grades.includes(grade)) || a.name.localeCompare(b.name))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, courses, grade, value])

  const add = (c: Course) => {
    onChange([...value, { courseId: c.id, term: c.durationTerms === 2 ? fall : c.seasons.includes('fall') ? fall : fall + 1 }])
    setQuery('')
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search courses for ${label.toLowerCase()}`}
          aria-label={`Search courses for ${label}`}
          aria-controls={listId}
          className="field pl-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault()
              add(matches[0])
            }
          }}
        />
        {matches.length > 0 ? (
          <ul id={listId} role="listbox" aria-label="Matching courses" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line-strong bg-graphite shadow-2xl">
            {matches.map((c) => (
              <li key={c.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => add(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/5">
                  <span>{c.name}</span>
                  <span className="shrink-0 text-xs text-fog">{c.durationTerms === 2 ? 'Full year' : 'Semester'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Courses for ${label}`}>
          {value.map((v) => {
            const c = courses.find((x) => x.id === v.courseId)
            if (!c) return null
            return (
              <li key={`${v.courseId}@${v.term}`} className="flex items-center gap-1 rounded-full border border-line-strong bg-obsidian py-1 pl-3 pr-1 text-sm">
                <span>{c.name}</span>
                {c.durationTerms === 1 ? (
                  <select
                    aria-label={`Semester for ${c.name}`}
                    value={v.term === fall ? 'fall' : 'spring'}
                    onChange={(e) =>
                      onChange(value.map((x) => (x === v ? { ...x, term: e.target.value === 'fall' ? fall : fall + 1 } : x)))
                    }
                    className="ml-1 rounded-md bg-transparent px-1 text-xs text-mist"
                  >
                    <option value="fall">Fall</option>
                    <option value="spring">Spring</option>
                  </select>
                ) : null}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="btn btn-quiet h-6 w-6 p-0" aria-label={`Remove ${c.name}`}>
                  <IconX size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-fog">
          <IconPlus size={13} className="mr-1 inline" />
          Nothing added for {label.toLowerCase()} yet.
        </p>
      )}
    </div>
  )
}
