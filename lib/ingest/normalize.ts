import type { GradeLevel, Season } from '../engine/types.ts'
import type { DraftCourse } from './types.ts'

/** A course as the model read it from one page. Every field may be missing. */
export interface RawCourse {
  name?: string | null
  code?: string | null
  department?: string | null
  description?: string | null
  credits?: number | null
  length?: 'year' | 'semester' | null
  grades?: number[] | null
  semesters?: string[] | null
  prerequisites?: string[][] | null
  prerequisite_text?: string | null
  notes?: string[] | null
  quote?: string | null
  page: number
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bu\.s\.\b/g, 'us')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeName(name: string): string {
  return slugify(name).replace(/-/g, ' ')
}

const GRADES = new Set([9, 10, 11, 12])

/**
 * Merges what the model read from each page into one draft per course. Keeps
 * the first page's source, fills gaps from later pages, and flags any field
 * two pages disagree on instead of choosing silently.
 */
export function mergeRawCourses(raw: RawCourse[], document: string): DraftCourse[] {
  const byName = new Map<string, DraftCourse>()
  for (const r of raw) {
    const name = r.name?.trim()
    if (!name) continue
    const key = normalizeName(name)
    const grades = (r.grades ?? []).filter((g): g is GradeLevel => GRADES.has(g))
    const seasons = (r.semesters ?? [])
      .map((s) => s.toLowerCase())
      .filter((s): s is Season => s === 'fall' || s === 'spring')
    const incoming: DraftCourse = {
      id: slugify(name),
      name,
      code: r.code?.trim() || null,
      department: r.department?.trim() || null,
      description: r.description?.trim() || null,
      credits: typeof r.credits === 'number' && r.credits > 0 ? r.credits : null,
      length: r.length === 'year' || r.length === 'semester' ? r.length : null,
      grades: grades.length ? [...new Set(grades)].sort((a, b) => a - b) : null,
      seasons: seasons.length ? [...new Set(seasons)] : null,
      prerequisites: r.prerequisites?.map((g) => g.map((n) => n.trim()).filter(Boolean)).filter((g) => g.length) ?? null,
      prerequisiteText: r.prerequisite_text?.trim() || null,
      notes: (r.notes ?? []).map((n) => n.trim()).filter(Boolean),
      source: { kind: 'catalog', document, page: r.page, ...(r.quote ? { quote: r.quote.trim().slice(0, 400) } : {}) },
      flags: [],
    }
    if (incoming.prerequisites && incoming.prerequisites.length === 0) incoming.prerequisites = null
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, incoming)
      continue
    }
    for (const field of ['code', 'department', 'description', 'credits', 'length', 'grades', 'seasons', 'prerequisites', 'prerequisiteText'] as const) {
      const a = existing[field]
      const b = incoming[field]
      if (a === null && b !== null) {
        ;(existing as unknown as Record<string, unknown>)[field] = b
      } else if (a !== null && b !== null && JSON.stringify(a) !== JSON.stringify(b) && field !== 'description') {
        existing.flags.push(`${field} differs between page ${existing.source.page} (${JSON.stringify(a)}) and page ${r.page} (${JSON.stringify(b)})`)
      }
    }
    existing.notes = [...new Set([...existing.notes, ...incoming.notes])]
  }
  const drafts = [...byName.values()]
  for (const d of drafts) {
    if (d.credits === null) d.flags.push('Credits not stated')
    if (d.length === null) d.flags.push('Not stated whether it is a semester or full-year course')
    if (d.grades === null) d.flags.push('Grade levels not stated')
    if (d.department === null) d.flags.push('Department not stated')
    if (d.description === null) d.flags.push('No description')
    if (d.prerequisiteText && !d.prerequisites) d.flags.push(`Prerequisite wording could not be read as courses: "${d.prerequisiteText}"`)
  }
  return drafts.sort((a, b) => a.id.localeCompare(b.id))
}
