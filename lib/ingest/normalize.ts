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
 * The course codes in a code field, normalized, so "ART101–Semester 1
 * ART102–Semester 2", "ART101/ART102", "ART101/102" and "ART101 —" all read
 * the same.
 */
export function courseCodes(code: string | null | undefined): string[] {
  if (!code) return []
  const tokens = code
    .toUpperCase()
    .replace(/([A-Z]{2,})\s+(\d{2,})/g, '$1$2')
    .split(/[\s,;/|–—-]+/)
    .filter((t) => t.length >= 3 && /\d/.test(t) && /^[A-Z0-9.]+$/.test(t))
  // A bare number right after a code shares its prefix: "VOC171/172".
  const codes = tokens.map((t, i) => {
    const prev = tokens[i - 1]?.match(/^([A-Z]+)(\d+)$/)
    return /^\d+$/.test(t) && prev && prev[2]!.length === t.length ? prev[1] + t : t
  })
  return [...new Set(codes)]
}

/**
 * Merges what the model read from each page into one draft per course. Keeps
 * the first page's source, fills gaps from later pages, and flags any field
 * two pages disagree on instead of choosing silently.
 *
 * A shared course code makes two records one course, whatever their names.
 * Without codes the name decides, but the same name under different codes is
 * a different course (an English and a social studies "American Studies").
 */
export function mergeRawCourses(raw: RawCourse[], document: string): DraftCourse[] {
  const drafts: DraftCourse[] = []
  const byName = new Map<string, DraftCourse[]>()
  const byCode = new Map<string, DraftCourse>()
  const codesOf = new Map<DraftCourse, Set<string>>()
  const ids = new Set<string>()
  for (const r of raw) {
    const name = r.name?.trim()
    if (!name) continue
    const key = normalizeName(name)
    const codes = courseCodes(r.code)
    const grades = (r.grades ?? []).filter((g): g is GradeLevel => GRADES.has(g))
    const seasons = (r.semesters ?? [])
      .map((s) => s.toLowerCase())
      .filter((s): s is Season => s === 'fall' || s === 'spring')
    const incoming: DraftCourse = {
      id: slugify(name),
      name,
      code: codes.length ? codes.join(' ') : r.code?.trim() || null,
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
    const named = byName.get(key) ?? []
    const sameName = named.filter((d) => codes.length === 0 || codesOf.get(d)!.size === 0 || codes.some((c) => codesOf.get(d)!.has(c)))
    const existing = codes.map((c) => byCode.get(c)).find((d) => d !== undefined) ?? sameName[0]
    if (!existing) {
      let id = incoming.id
      if (ids.has(id) && codes[0]) id = `${incoming.id}-${codes[0].toLowerCase()}`
      for (let n = 2; ids.has(id); n++) id = `${incoming.id}-${n}`
      ids.add(id)
      incoming.id = id
      drafts.push(incoming)
      byName.set(key, [...named, incoming])
      codesOf.set(incoming, new Set(codes))
      for (const c of codes) byCode.set(c, incoming)
      continue
    }
    if (codes.length === 0 && sameName.length > 1) {
      existing.flags.push(`Page ${r.page} names "${name}" without a code, and ${sameName.length} courses share that name: check which one it means`)
    }
    for (const field of ['department', 'description', 'credits', 'length', 'grades', 'seasons', 'prerequisites', 'prerequisiteText'] as const) {
      const a = existing[field]
      const b = incoming[field]
      if (a === null && b !== null) {
        ;(existing as unknown as Record<string, unknown>)[field] = b
      } else if (a !== null && b !== null && JSON.stringify(a) !== JSON.stringify(b) && field !== 'description') {
        existing.flags.push(`${field} differs between page ${existing.source.page} (${JSON.stringify(a)}) and page ${r.page} (${JSON.stringify(b)})`)
      }
    }
    const theirs = codesOf.get(existing)!
    for (const c of codes) {
      theirs.add(c)
      if (!byCode.has(c)) byCode.set(c, existing)
    }
    if (theirs.size) existing.code = [...theirs].join(' ')
    else if (existing.code === null) existing.code = incoming.code
    if (!named.includes(existing)) byName.set(key, [...named, existing])
    existing.notes = [...new Set([...existing.notes, ...incoming.notes])]
  }
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
