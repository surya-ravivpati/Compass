import { termLabel, YEAR_NAMES, type GradeLevel, type TermIndex } from './engine/index.ts'

/**
 * Calendar helpers live outside the engine: the engine has no clock. These
 * convert "today" into the school-year facts the app shows and the engine
 * takes as input.
 */

/** Calendar year the current school year started in (Aug-Jul years). */
export function currentAcademicYear(today: Date): number {
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
}

export function graduationYear(grade: GradeLevel, academicYear: number): number {
  return academicYear + 1 + (12 - grade)
}

/** First term Compass may plan: the fall of the first school year not yet begun. */
export function startTermFor(grade: GradeLevel, yearStarted: boolean): TermIndex {
  return (grade - 9) * 2 + (yearStarted ? 2 : 0)
}

export interface NowInfo {
  /** The term the student is in right now, or null over the summer before it. */
  term: TermIndex | null
  label: string
}

export function whereNow(student: { grade: number | null; yearStarted: boolean }, today: Date): NowInfo {
  if (!student.grade) return { term: null, label: '—' }
  const yearIndex = student.grade - 9
  if (!student.yearStarted) {
    return { term: null, label: `Summer before ${YEAR_NAMES[yearIndex]!.toLowerCase()} year` }
  }
  const spring = today.getMonth() <= 5
  const term = yearIndex * 2 + (spring ? 1 : 0)
  return { term, label: termLabel(term) }
}

export function academicYearLabel(year: number): string {
  return `${year}–${String((year + 1) % 100).padStart(2, '0')}`
}
