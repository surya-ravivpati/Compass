import {
  BEFORE_HIGH_SCHOOL,
  TERM_COUNT,
  TERMS_PER_YEAR,
  type Course,
  type GradeLevel,
  type Season,
  type TermIndex,
} from './types.ts'

export const YEAR_NAMES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const

export function yearOfTerm(term: TermIndex): number {
  return Math.floor(term / TERMS_PER_YEAR)
}

export function gradeOfTerm(term: TermIndex): GradeLevel {
  return (9 + yearOfTerm(term)) as GradeLevel
}

export function seasonOfTerm(term: TermIndex): Season {
  return term % TERMS_PER_YEAR === 0 ? 'fall' : 'spring'
}

export function termOf(grade: GradeLevel, season: Season): TermIndex {
  return (grade - 9) * TERMS_PER_YEAR + (season === 'fall' ? 0 : 1)
}

export function firstTermOfGrade(grade: GradeLevel): TermIndex {
  return termOf(grade, 'fall')
}

export function isValidTerm(term: TermIndex): boolean {
  return Number.isInteger(term) && term >= 0 && term < TERM_COUNT
}

/** "Junior Fall", or "Before high school". */
export function termLabel(term: TermIndex): string {
  if (term === BEFORE_HIGH_SCHOOL) return 'Before high school'
  const year = YEAR_NAMES[yearOfTerm(term)]
  return `${year} ${seasonOfTerm(term) === 'fall' ? 'Fall' : 'Spring'}`
}

/** "junior year". Lower-case for use mid-sentence. */
export function yearPhrase(term: TermIndex): string {
  if (term === BEFORE_HIGH_SCHOOL) return 'before high school'
  return `${YEAR_NAMES[yearOfTerm(term)]!.toLowerCase()} year`
}

/**
 * Where a placement sits, phrased for a sentence: "junior year" for a
 * full-year course, "Junior Fall" for a semester one.
 */
export function placementPhrase(term: TermIndex, durationTerms: number): string {
  if (term === BEFORE_HIGH_SCHOOL) return 'before high school'
  if (durationTerms === 2 && seasonOfTerm(term) === 'fall') return yearPhrase(term)
  return termLabel(term)
}

/** "in junior year", "in Senior Fall", or "before high school". */
export function atPhrase(term: TermIndex, durationTerms: number): string {
  if (term === BEFORE_HIGH_SCHOOL) return 'before high school'
  return `in ${placementPhrase(term, durationTerms)}`
}

/** Last term a placement occupies. Pre-high-school work occupies no term. */
export function endTerm(start: TermIndex, durationTerms: number): TermIndex {
  if (start === BEFORE_HIGH_SCHOOL) return BEFORE_HIGH_SCHOOL
  return start + durationTerms - 1
}

export function occupiedTerms(start: TermIndex, durationTerms: number): TermIndex[] {
  if (start === BEFORE_HIGH_SCHOOL) return []
  const terms: TermIndex[] = []
  for (let t = start; t < start + durationTerms; t++) terms.push(t)
  return terms
}

/**
 * Whether a course may start in `term` by the catalog's own rules: the season
 * it starts in, the grades it is open to, and whether it finishes by the end
 * of senior year. Says nothing about prerequisites or capacity.
 */
export function availabilityProblem(
  course: Course,
  term: TermIndex,
): null | { kind: 'season' | 'grade' | 'overrun'; message: string } {
  const end = endTerm(term, course.durationTerms)
  if (!isValidTerm(term) || end >= TERM_COUNT) {
    return {
      kind: 'overrun',
      message:
        course.durationTerms === 2
          ? `${course.name} is a full-year course, so it has to start in a fall term to finish by graduation.`
          : `${course.name} does not fit before graduation.`,
    }
  }
  const season = seasonOfTerm(term)
  if (!course.seasons.includes(season)) {
    if (course.durationTerms === 2) {
      return {
        kind: 'season',
        message: `${course.name} is a full-year course, so it has to start in the fall.`,
      }
    }
    const only = course.seasons[0] === 'fall' ? 'fall' : 'spring'
    return {
      kind: 'season',
      message: `${course.name} is only offered in the ${only}.`,
    }
  }
  for (const t of occupiedTerms(term, course.durationTerms)) {
    const grade = gradeOfTerm(t)
    if (!course.grades.includes(grade)) {
      return {
        kind: 'grade',
        message: `${course.name} is open to ${gradeList(course.grades)}, not ${ordinal(grade)} grade.`,
      }
    }
  }
  return null
}

export function ordinal(grade: number): string {
  return `${grade}th`
}

export function gradeList(grades: GradeLevel[]): string {
  const sorted = [...grades].sort((a, b) => a - b)
  if (sorted.length === 0) return 'no grades'
  if (sorted.length === 1) return `${ordinal(sorted[0]!)} graders`
  const contiguous = sorted.every((g, i) => i === 0 || g === sorted[i - 1]! + 1)
  if (contiguous) return `grades ${sorted[0]}–${sorted[sorted.length - 1]}`
  return `grades ${sorted.join(', ')}`
}
