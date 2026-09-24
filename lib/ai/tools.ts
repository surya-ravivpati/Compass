import {
  allocateRequirements,
  analyzeWorkload,
  buildPreferenceModel,
  describeGroup,
  explainPlacement,
  GOAL_TAGS,
  interestScore,
  earliestStarts,
  occupiedTerms,
  placementPhrase,
  previewEdit,
  runScenario,
  termLabel,
  validatePlan,
  whyNot,
  YEAR_NAMES,
  type Catalog,
  type Course,
  type GoalId,
  type Placement,
  type PlacementReason,
  type Preferences,
  type Rigor,
  type Scenario,
  type StudentState,
  type TermIndex,
} from '../engine/index.ts'
import type { FunctionDeclaration } from './gemini.ts'

/** Everything a tool may read: this student's own data and their school's catalog. */
export interface ToolContext {
  catalog: Catalog
  student: StudentState
  placements: Placement[]
  preferences: Preferences
  reasons: Record<string, PlacementReason[]>
}

/** A database-backed fact the answer relied on, shown to the student as a source. */
export interface Fact {
  text: string
  source: string
}

/** Something the student can choose to open. The AI never applies it. */
export type Proposal =
  | { kind: 'move'; courseId: string; fromTerm: number; toTerm: number; title: string }
  | { kind: 'scenario'; scenario: Scenario; title: string }

export interface ToolResult {
  result: Record<string, unknown>
  facts: Fact[]
  proposal?: Proposal
}

const courseParam = { type: 'STRING' as const, description: 'Course name or id, e.g. "AP Calculus BC".' }
const termParam = {
  type: 'STRING' as const,
  description: 'A term like "Junior Fall" or "Sophomore Spring", or a year like "junior year" for full-year courses.',
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_plan_overview',
    description: "The student's current four-year plan: every course by term, and whether the plan passes validation.",
  },
  {
    name: 'get_course',
    description: "A course's catalog record: level, credits, length, grades, seasons, prerequisites, what it opens, what it counts toward, and where it sits in the student's plan.",
    parameters: { type: 'OBJECT', properties: { course: courseParam }, required: ['course'] },
  },
  {
    name: 'explain_placement',
    description: 'Why a course in the plan is in its term, from the prerequisite graph, school policy, and the planner\'s recorded reasons.',
    parameters: { type: 'OBJECT', properties: { course: courseParam }, required: ['course'] },
  },
  {
    name: 'why_not',
    description: "Why the student can't take a course (at all, or in a given term): walks the prerequisite graph from what they've taken and gives the earliest possible term.",
    parameters: { type: 'OBJECT', properties: { course: courseParam, term: termParam }, required: ['course'] },
  },
  {
    name: 'get_requirements',
    description: 'Graduation requirements and the student\'s progress: completed, in progress, planned, and remaining credits.',
  },
  {
    name: 'search_courses',
    description: 'Search the school catalog by text, interest, or department. Returns courses with whether each is reachable for this student.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Words to match in names and descriptions.' },
        interest: { type: 'STRING', description: 'An interest such as engineering, medicine, business, computer-science, arts, humanities.' },
        department: { type: 'STRING', description: 'Department name, e.g. Science.' },
      },
    },
  },
  {
    name: 'preview_move',
    description: 'Preview moving a planned course to another term: the conflicts it would create and the adjustments Compass would propose. Does not change the plan.',
    parameters: { type: 'OBJECT', properties: { course: courseParam, term: termParam }, required: ['course', 'term'] },
  },
  {
    name: 'compare_scenario',
    description:
      'Run a what-if against the plan without changing it: replace a course, drop courses, add a course, or change rigor/goals. Returns the consequences side by side.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: { type: 'STRING', enum: ['replace', 'drop', 'add', 'priorities'] },
        course: courseParam,
        with_course: { type: 'STRING', description: 'For replace: the course to take instead.' },
        rigor: { type: 'STRING', enum: ['balanced', 'challenging', 'very-rigorous', 'maximum'] },
        goals: { type: 'ARRAY', items: { type: 'STRING' }, description: 'For priorities: goal ids such as athletics, balanced, stem, engineering.' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_workload',
    description: 'How heavy each semester looks from the catalog\'s workload estimates, with tradeoff notes about labs, AP load, and the student\'s activities.',
  },
]

export function executeTool(ctx: ToolContext, name: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (name) {
      case 'get_plan_overview':
        return planOverview(ctx)
      case 'get_course':
        return withCourse(ctx, args.course, (course) => courseRecord(ctx, course))
      case 'explain_placement':
        return withCourse(ctx, args.course, (course) => explain(ctx, course))
      case 'why_not':
        return withCourse(ctx, args.course, (course) => whyNotTool(ctx, course, args.term))
      case 'get_requirements':
        return requirements(ctx)
      case 'search_courses':
        return search(ctx, args)
      case 'preview_move':
        return withCourse(ctx, args.course, (course) => previewMove(ctx, course, args.term))
      case 'compare_scenario':
        return compare(ctx, args)
      case 'get_workload':
        return workload(ctx)
      default:
        return { result: { error: `Unknown tool ${name}.` }, facts: [] }
    }
  } catch (err) {
    console.error('tool failed', name, err)
    return { result: { error: 'The planning engine could not answer that. Do not guess; tell the student it could not be checked.' }, facts: [] }
  }
}

// ------------------------------------------------------------------ helpers

function sourceOf(course: Course): string {
  return course.source.page ? `${course.source.document}, p. ${course.source.page}` : course.source.document
}

/** Resolves "AP Calc BC", "ap-calculus-bc", or "calculus bc" to catalog courses. */
export function resolveCourse(catalog: Catalog, raw: unknown): Course[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const direct = catalog.courses.get(raw.trim())
  if (direct) return [direct]
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bcalc\b/g, 'calculus')
      .replace(/\bprecalc\b/g, 'precalculus')
      .replace(/\bbio\b/g, 'biology')
      .replace(/\bchem\b/g, 'chemistry')
      .replace(/\bgov\b/g, 'government')
      .replace(/\bcs\b/g, 'computer science')
      .replace(/\bus\b/g, 'u s')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const q = norm(raw)
  const all = [...catalog.courses.values()]
  const exact = all.filter((c) => norm(c.name) === q)
  if (exact.length) return exact
  const words = q.split(' ').filter(Boolean)
  const scored = all
    .map((c) => {
      const name = norm(c.name)
      const hits = words.filter((w) => name.split(' ').includes(w)).length
      return { c, hits, contains: name.includes(q) }
    })
    .filter((x) => x.contains || x.hits === words.length)
    .sort((a, b) => Number(b.contains) - Number(a.contains) || a.c.name.length - b.c.name.length)
  return scored.slice(0, 5).map((x) => x.c)
}

function withCourse(ctx: ToolContext, raw: unknown, fn: (course: Course) => ToolResult): ToolResult {
  const matches = resolveCourse(ctx.catalog, raw)
  if (matches.length === 0) {
    return { result: { error: `No course named "${String(raw)}" is in this school's catalog.` }, facts: [] }
  }
  if (matches.length > 1 && !matches.some((m) => m.name.toLowerCase() === String(raw).toLowerCase())) {
    return { result: { ambiguous: true, candidates: matches.map((m) => m.name), note: 'Ask the student which one they mean.' }, facts: [] }
  }
  return fn(matches[0]!)
}

/** Parses "Junior Fall", "junior year", "11th grade spring", "senior spring". */
export function parseTerm(raw: unknown): TermIndex | null {
  if (typeof raw !== 'string') return null
  const s = raw.toLowerCase()
  let year = -1
  YEAR_NAMES.forEach((name, i) => {
    if (s.includes(name.toLowerCase())) year = i
  })
  const grade = s.match(/\b(9|10|11|12)(th)?\b/)
  if (year < 0 && grade) year = Number(grade[1]) - 9
  if (year < 0) return null
  return year * 2 + (s.includes('spring') ? 1 : 0)
}

function placementOf(ctx: ToolContext, courseId: string): Placement | undefined {
  return ctx.placements.find((p) => p.courseId === courseId)
}

function where(ctx: ToolContext, p: Placement): string {
  const course = ctx.catalog.courses.get(p.courseId)!
  return p.term < 0 ? 'before high school' : placementPhrase(p.term, course.durationTerms)
}

// -------------------------------------------------------------------- tools

function planOverview(ctx: ToolContext): ToolResult {
  const plan = { placements: ctx.placements }
  const v = validatePlan(ctx.catalog, ctx.student, plan, ctx.preferences)
  const terms = Array.from({ length: 8 }, (_, t) => ({
    term: termLabel(t),
    courses: ctx.placements
      .filter((p) => p.term >= 0 && occupiedTerms(p.term, ctx.catalog.courses.get(p.courseId)!.durationTerms).includes(t))
      .map((p) => `${ctx.catalog.courses.get(p.courseId)!.name}${p.status === 'planned' ? '' : ` (${p.status})`}`),
  }))
  return {
    result: {
      is_demo_catalog: ctx.catalog.school.isDemo,
      school: ctx.catalog.school.name,
      before_high_school: ctx.placements.filter((p) => p.term < 0).map((p) => ctx.catalog.courses.get(p.courseId)!.name),
      terms,
      graduation_path_valid: v.graduationPathValid,
      checks: v.checks.map((c) => ({ check: c.label, status: c.status })),
      issues: v.findings.filter((f) => f.severity !== 'info').map((f) => f.message),
    },
    facts: [{ text: `Plan checked by the Compass engine: graduation path ${v.graduationPathValid ? 'valid' : 'not valid yet'}.`, source: 'Compass engine' }],
  }
}

function courseRecord(ctx: ToolContext, course: Course): ToolResult {
  const p = placementOf(ctx, course.id)
  const requirementNames = course.satisfies.map((id) => ctx.catalog.requirements.get(id)?.name).filter(Boolean)
  return {
    result: {
      name: course.name,
      department: ctx.catalog.departments.get(course.department)?.name,
      level: course.level,
      credits: course.credits,
      length: course.durationTerms === 2 ? 'full year' : 'one semester',
      offered: course.durationTerms === 2 ? 'starts in fall' : course.seasons.join(' or '),
      grades: course.grades,
      prerequisites: course.prerequisites.map((g) => describeGroup(ctx.catalog, g)),
      prerequisite_notes: course.prerequisites.map((g) => g.note).filter(Boolean),
      opens: (ctx.catalog.dependents.get(course.id) ?? []).map((id) => ctx.catalog.courses.get(id)!.name),
      counts_toward: requirementNames.length ? requirementNames : ['Electives'],
      workload_estimate: ['', 'light', 'moderate', 'heavy', 'intense'][course.workload],
      lab: !!course.lab,
      description: course.description,
      catalog_notes: course.notes ?? [],
      in_plan: p ? { status: p.status, when: where(ctx, p) } : null,
      source: sourceOf(course),
      is_demo_catalog: ctx.catalog.school.isDemo,
    },
    facts: [
      {
        text: course.prerequisites.length
          ? `${course.name} requires ${course.prerequisites.map((g) => describeGroup(ctx.catalog, g)).join('; and ')}.`
          : `${course.name} has no prerequisites.`,
        source: sourceOf(course),
      },
    ],
  }
}

function explain(ctx: ToolContext, course: Course): ToolResult {
  const p = placementOf(ctx, course.id)
  if (!p) return { result: { in_plan: false, note: `${course.name} is not in the plan. Use why_not to explain.` }, facts: [] }
  const progress = allocateRequirements(ctx.catalog, ctx.placements)
  const e = explainPlacement(ctx.catalog, ctx.student, { placements: ctx.placements }, p, {
    reasons: ctx.reasons[`${p.courseId}@${p.term}`],
    progress,
  })
  return {
    result: { course: course.name, when: where(ctx, p), explanation: e.headline, facts: e.facts.map((f) => f.text) },
    facts: [{ text: e.headline, source: `${sourceOf(course)} + Compass engine` }],
  }
}

function whyNotTool(ctx: ToolContext, course: Course, rawTerm: unknown): ToolResult {
  const term = rawTerm === undefined ? undefined : parseTerm(rawTerm)
  const w = whyNot(ctx.catalog, ctx.student, { placements: ctx.placements }, course.id, term ?? undefined)
  return {
    result: {
      course: course.name,
      reachable_before_graduation: w.reachable,
      earliest_start: w.earliestTerm === null ? null : placementPhrase(w.earliestTerm, course.durationTerms),
      prerequisite_chain: w.chain.map((id) => ctx.catalog.courses.get(id)!.name),
      explanation: w.explanation,
      blockers_for_requested_term: w.blockers,
      ...(rawTerm !== undefined && term === null ? { term_not_understood: String(rawTerm) } : {}),
    },
    facts: [{ text: w.explanation, source: `${sourceOf(course)} + Compass engine` }],
  }
}

function requirements(ctx: ToolContext): ToolResult {
  const progress = allocateRequirements(ctx.catalog, ctx.placements)
  return {
    result: {
      total: progress.total,
      requirements: progress.requirements.map((r) => ({
        name: r.requirement.name,
        description: r.requirement.description,
        required: r.required,
        completed: r.completed,
        in_progress: r.inProgress,
        planned: r.planned,
        remaining: r.remaining,
        status: r.status,
        must_include: r.mustInclude.map((m) => ({ label: m.group.label, covered: !!m.satisfiedBy })),
      })),
      note: '"complete" means finished coursework; planned courses are never complete.',
    },
    facts: [{ text: `Graduation requirements from ${ctx.catalog.school.source.document}.`, source: ctx.catalog.school.source.document }],
  }
}

function search(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const query = typeof args.query === 'string' ? args.query.toLowerCase().trim() : ''
  const interest = typeof args.interest === 'string' ? args.interest.toLowerCase().trim().replace(/\s+/g, '-') : ''
  const dept = typeof args.department === 'string' ? args.department.toLowerCase().trim() : ''
  const goalTags = (GOAL_TAGS as Record<string, string[]>)[interest] ?? (interest ? [interest] : [])
  const model = buildPreferenceModel({ ...ctx.preferences, interests: goalTags, goals: [] }, ctx.catalog.school)
  const earliest = earliestStarts(ctx.catalog, ctx.placements.filter((p) => p.status !== 'planned'), ctx.student.startTerm)
  const results = [...ctx.catalog.courses.values()]
    .filter((c) => !dept || ctx.catalog.departments.get(c.department)?.name.toLowerCase().includes(dept))
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query))
    .filter((c) => !interest || interestScore(model, c) > 0)
    .slice(0, 14)
    .map((c) => {
      const p = placementOf(ctx, c.id)
      const e = earliest.get(c.id)
      return {
        name: c.name,
        level: c.level,
        in_plan: p ? where(ctx, p) : null,
        reachable: p ? true : e?.term != null,
        earliest: !p && e?.term != null ? placementPhrase(e.term, c.durationTerms) : null,
      }
    })
  return {
    result: { count: results.length, courses: results, is_demo_catalog: ctx.catalog.school.isDemo },
    facts: [{ text: `Searched ${ctx.catalog.school.name}'s course catalog.`, source: ctx.catalog.school.source.document }],
  }
}

function previewMove(ctx: ToolContext, course: Course, rawTerm: unknown): ToolResult {
  const p = ctx.placements.find((x) => x.courseId === course.id && x.status === 'planned')
  if (!p) return { result: { error: `${course.name} isn't a planned course in this plan, so it can't be moved.` }, facts: [] }
  let to = parseTerm(rawTerm)
  if (to === null) return { result: { error: `Couldn't understand the term "${String(rawTerm)}".` }, facts: [] }
  if (course.durationTerms === 2 && to % 2 === 1) to -= 1
  const preview = previewEdit(ctx.catalog, ctx.student, { placements: ctx.placements }, { kind: 'move', courseId: course.id, fromTerm: p.term, toTerm: to }, ctx.preferences)
  const title = `${course.name} in ${placementPhrase(to, course.durationTerms)}`
  return {
    result: {
      change: preview.summary,
      creates_conflicts: preview.introduced.map((f) => f.message),
      resolves: preview.resolved.map((f) => f.message),
      other_courses_affected: preview.affected.map((a) => a.message),
      proposed_adjustment: preview.cascade?.summary ?? null,
      plan_valid_with_adjustment: preview.cascade ? preview.cascade.validation.graduationPathValid : null,
      problems_left_after_adjustment: preview.cascade
        ? preview.cascade.validation.findings.filter((f) => f.severity === 'error').map((f) => f.message)
        : [],
      plan_valid_after_change: preview.after.graduationPathValid,
      note: 'Nothing has changed. The student can open this preview in their plan.',
    },
    facts: [{ text: `Checked moving ${course.name} with the Compass engine.`, source: 'Compass engine' }],
    proposal: { kind: 'move', courseId: course.id, fromTerm: p.term, toTerm: to, title },
  }
}

function compare(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const kind = args.kind
  let scenario: Scenario | null = null
  if (kind === 'replace') {
    const from = resolveCourse(ctx.catalog, args.course)[0]
    const to = resolveCourse(ctx.catalog, args.with_course)[0]
    if (!from || !to) return { result: { error: 'Both the current course and the replacement must be catalog courses.' }, facts: [] }
    scenario = { kind: 'replace', courseId: from.id, withCourseId: to.id }
  } else if (kind === 'drop') {
    const course = resolveCourse(ctx.catalog, args.course)[0]
    if (!course) return { result: { error: 'Name a course to drop.' }, facts: [] }
    // Dropping a language means the rest of its sequence too.
    const ids = course.sequence
      ? ctx.placements
          .filter((p) => p.status === 'planned' && ctx.catalog.courses.get(p.courseId)?.sequence?.id === course.sequence!.id)
          .map((p) => p.courseId)
      : [course.id]
    scenario = { kind: 'drop', courseIds: ids.length ? ids : [course.id] }
  } else if (kind === 'add') {
    const course = resolveCourse(ctx.catalog, args.course)[0]
    if (!course) return { result: { error: 'Name a course to add.' }, facts: [] }
    scenario = { kind: 'add', courseId: course.id }
  } else if (kind === 'priorities') {
    const rigor = (['balanced', 'challenging', 'very-rigorous', 'maximum'] as const).includes(args.rigor as Rigor)
      ? (args.rigor as Rigor)
      : ctx.preferences.rigor
    const goals = Array.isArray(args.goals)
      ? (args.goals.filter((g) => typeof g === 'string' && g in GOAL_TAGS) as GoalId[])
      : ctx.preferences.goals
    scenario = { kind: 'preferences', preferences: { ...ctx.preferences, rigor, goals } }
  }
  if (!scenario) return { result: { error: 'Unknown scenario kind.' }, facts: [] }
  const r = runScenario(ctx.catalog, ctx.student, ctx.preferences, { placements: ctx.placements }, scenario)
  return {
    result: {
      scenario: r.title,
      valid_schedule_exists: r.status === 'valid',
      problems: r.problems.map((p) => p.message),
      courses_added: r.comparison.diff.added.map((p) => `${ctx.catalog.courses.get(p.courseId)!.name} (${where(ctx, p)})`),
      courses_removed: r.comparison.diff.removed.map((p) => ctx.catalog.courses.get(p.courseId)!.name),
      downstream_changes: r.comparison.downstream.map((d) => d.text),
      prerequisite_effects: r.comparison.prerequisiteEffects.map((d) => d.text),
      requirement_changes: r.comparison.requirementChanges.map((c) => `${c.name}: ${c.before.covered} → ${c.after.covered} of ${c.required} credits planned (${c.after.status})`),
      workload_change: r.comparison.workload
        .filter((w) => w.before !== w.after)
        .map((w) => `${termLabel(w.term)}: workload ${w.before} → ${w.after}`),
      note: 'Nothing has changed. Present consequences, not a recommendation.',
    },
    facts: [{ text: `Compared "${r.title}" with the current plan using the Compass engine.`, source: 'Compass engine' }],
    proposal: { kind: 'scenario', scenario, title: r.title },
  }
}

function workload(ctx: ToolContext): ToolResult {
  const w = analyzeWorkload(ctx.catalog, { placements: ctx.placements }, ctx.preferences)
  return {
    result: {
      terms: w.terms.filter((t) => t.term >= ctx.student.startTerm).map((t) => ({ term: termLabel(t.term), level: t.level, labs: t.labs, ap_or_college: t.advanced })),
      notes: w.notes.map((n) => n.text),
      activities: ctx.preferences.activities.map((a) => `${a.name} (${a.seasons.join(', ')}, ${a.hoursPerWeek} hrs/week)`),
      caveat: 'Workload levels are catalog estimates, not school rules.',
    },
    facts: [{ text: 'Workload estimates from the course catalog.', source: ctx.catalog.school.source.document }],
  }
}
