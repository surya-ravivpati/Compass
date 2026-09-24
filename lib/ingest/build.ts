import { validateCatalog } from '../engine/catalog.ts'
import type { Course, Level, PrereqGroup, Requirement, SchoolConfig, SourceRef, Workload } from '../engine/types.ts'
import { normalizeName, slugify } from './normalize.ts'
import type { CatalogOverrides, DraftCatalog, DraftCourse } from './types.ts'

export interface BuildResult {
  school: SchoolConfig | null
  /** Blocking: the catalog can't be used until each is resolved. */
  errors: string[]
  /** Worth a reviewer's look, but not blocking. */
  warnings: string[]
}

const LEVEL_WORKLOAD: Record<Level, Workload> = { standard: 2, honors: 3, ap: 3, 'post-ap': 4 }

/**
 * Turns a reviewed draft into a SchoolConfig. Nothing the engine depends on
 * is guessed: each required field comes from the PDF or from overrides.json,
 * and a missing one is an error naming the course. The only derivations are
 * mechanical ones (an "AP" name means AP level) and they're reported.
 */
export function buildSchool(draft: DraftCatalog, overrides: CatalogOverrides): BuildResult {
  const errors: string[] = []
  const warnings: string[] = []
  const configSource: SourceRef = { kind: 'school-config', document: 'overrides.json (reviewed school configuration)' }

  const deptFor = (name: string | null): string | null => {
    if (!name) return null
    const n = normalizeName(name)
    return overrides.departments.find((d) => d.match.some((m) => normalizeName(m) === n) || normalizeName(d.name) === n)?.id ?? null
  }

  const drafts = draft.courses.filter((d) => !overrides.courses?.[d.id]?.exclude)
  const byName = new Map(drafts.map((d) => [normalizeName(d.name), d]))
  const byCode = new Map(drafts.filter((d) => d.code).map((d) => [d.code!.toLowerCase(), d]))
  const resolve = (name: string): DraftCourse | null =>
    byName.get(normalizeName(name)) ?? byCode.get(name.trim().toLowerCase()) ?? byName.get(normalizeName(slugify(name))) ?? null

  let estimatedWorkload = 0
  const courses: Course[] = []
  for (const d of drafts) {
    const o = overrides.courses?.[d.id] ?? {}
    const at = `${d.name} (page ${d.source.page ?? '?'})`
    const department = deptFor(d.department)
    if (!department) errors.push(`${at}: department "${d.department ?? 'missing'}" matches no department in overrides.json.`)
    const credits = o.credits ?? d.credits
    if (credits === null || credits === undefined) errors.push(`${at}: credits aren't stated. Add "credits" in overrides.json.`)
    const durationTerms = o.durationTerms ?? (d.length === 'year' ? 2 : d.length === 'semester' ? 1 : null)
    if (durationTerms === null) errors.push(`${at}: the catalog doesn't say whether it's a semester or full-year course. Add "durationTerms".`)
    const grades = o.grades ?? d.grades
    if (!grades?.length) errors.push(`${at}: grade levels aren't stated. Add "grades".`)
    const seasons = o.seasons ?? (durationTerms === 2 ? ['fall' as const] : d.seasons)
    if (durationTerms === 1 && !seasons?.length) errors.push(`${at}: semester course with no stated semester. Add "seasons" (fall, spring, or both).`)
    const level: Level =
      o.level ?? (/^ap\b/i.test(d.name) ? 'ap' : /\bhonors\b/i.test(d.name) ? 'honors' : 'standard')
    const workload = o.workload ?? LEVEL_WORKLOAD[level]
    if (o.workload === undefined) estimatedWorkload++

    let prerequisites: PrereqGroup[] = []
    if (o.prerequisites) {
      prerequisites = o.prerequisites.map((g) => ({ anyOf: g.map((x) => ({ courseId: x.courseId, timing: x.timing ?? 'before' })) }))
    } else if (d.prerequisites) {
      for (const group of d.prerequisites) {
        const ids: string[] = []
        for (const name of group) {
          const hit = resolve(name)
          if (hit) ids.push(hit.id)
          else errors.push(`${at}: prerequisite "${name}" isn't a course in this catalog. Fix the name or set "prerequisites" in overrides.json.`)
        }
        if (ids.length) prerequisites.push({ anyOf: [...new Set(ids)].map((courseId) => ({ courseId, timing: 'before' })) })
      }
      if (d.prerequisiteText) warnings.push(`${at}: check the prerequisites were read correctly from "${d.prerequisiteText}".`)
    }

    const satisfies =
      o.satisfies ??
      overrides.requirements.filter((r) => r.kind === 'category' && department && r.departments?.includes(department)).map((r) => r.id)

    for (const flag of d.flags) warnings.push(`${at}: ${flag}`)

    if (department && credits && durationTerms && grades?.length && seasons?.length) {
      courses.push({
        id: d.id,
        ...(d.code ? { code: d.code } : {}),
        name: d.name,
        department,
        description: d.description ?? '',
        credits,
        durationTerms,
        grades,
        seasons,
        prerequisites,
        level,
        workload,
        ...(o.workload === undefined ? { workloadEstimated: true } : {}),
        tags: [department],
        satisfies,
        ...(o.sequence ? { sequence: o.sequence } : {}),
        ...(o.equivalenceGroup ? { equivalenceGroup: o.equivalenceGroup } : {}),
        ...(o.maxEnrollments ? { maxEnrollments: o.maxEnrollments } : {}),
        ...(d.notes.length ? { notes: d.notes } : {}),
        source: d.source,
      })
    }
  }
  if (estimatedWorkload) {
    warnings.push(`${estimatedWorkload} course(s) have no workload in the catalog; Compass estimates it from the level and labels it as an estimate.`)
  }

  const requirements: Requirement[] = overrides.requirements.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    credits: r.credits,
    kind: r.kind,
    ...(r.mustInclude ? { mustInclude: r.mustInclude } : {}),
    ...(r.sameSequence ? { sameSequence: true } : {}),
    source: configSource,
  }))
  if (draft.requirements.length) {
    warnings.push(
      `The PDF lists graduation requirements (${draft.requirements.map((r) => `${r.name}${r.credits !== null ? ` ${r.credits}` : ''}`).join(', ')}). Confirm overrides.json matches them.`,
    )
  }

  if (errors.length) return { school: null, errors, warnings }

  const school: SchoolConfig = {
    id: overrides.school.id,
    name: overrides.school.name,
    isDemo: false,
    load: overrides.school.load,
    totalCredits: overrides.school.totalCredits,
    preHighSchoolCredit: overrides.school.preHighSchoolCredit,
    departments: overrides.departments.map(({ match: _match, ...d }) => d),
    requirements,
    policies: (overrides.policies ?? []).map((p) => ({ ...p, enforcement: p.enforcement ?? 'target', source: configSource }) as SchoolConfig['policies'][number]),
    courses,
    mathPlacement: overrides.mathPlacement ?? [],
    source: { kind: 'catalog', document: draft.document },
  }
  for (const issue of validateCatalog(school)) {
    ;(issue.severity === 'error' ? errors : warnings).push(`${issue.path}: ${issue.message}`)
  }
  return errors.length ? { school: null, errors, warnings } : { school, errors, warnings }
}
