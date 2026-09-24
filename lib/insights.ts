import {
  analyzeWorkload,
  buildCatalog,
  occupiedTerms,
  validatePlan,
  type Catalog,
  type Placement,
  type Preferences,
  type SchoolConfig,
  type ValidationReport,
  type WorkloadNote,
} from './engine/index.ts'

export interface PlanInsights {
  catalog: Catalog
  validation: ValidationReport
  workloadNotes: WorkloadNote[]
}

/** Engine results for a plan, computed on the server for first paint. */
export function planInsights(school: SchoolConfig, startTerm: number, placements: Placement[], prefs: Preferences): PlanInsights {
  const catalog = buildCatalog(school)
  const plan = { placements }
  return {
    catalog,
    validation: validatePlan(catalog, { startTerm }, plan, prefs),
    workloadNotes: analyzeWorkload(catalog, plan, prefs).notes,
  }
}

export function coursesInTerm(catalog: Catalog, placements: Placement[], term: number) {
  return placements
    .filter((p) => p.term >= 0 && catalog.courses.has(p.courseId))
    .filter((p) => occupiedTerms(p.term, catalog.courses.get(p.courseId)!.durationTerms).includes(term))
    .map((p) => ({ placement: p, course: catalog.courses.get(p.courseId)! }))
    .sort((a, b) => (catalog.departments.get(a.course.department)?.order ?? 99) - (catalog.departments.get(b.course.department)?.order ?? 99))
}
