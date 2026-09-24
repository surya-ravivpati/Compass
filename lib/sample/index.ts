import { DEMO_SCHOOL } from '../catalog/demo-school.ts'
import {
  allocateRequirements,
  buildCatalog,
  DEFAULT_PREFERENCES,
  explainPlacement,
  generatePlan,
  runScenario,
  whyNot,
  type Placement,
  type Preferences,
  type SchoolConfig,
} from '../engine/index.ts'

/**
 * A sample student, planned by the real engine against the demo catalog.
 * The landing page shows this output as-is: nothing on it is hand-written
 * to look like a plan.
 */
export function samplePlan() {
  const catalog = buildCatalog(DEMO_SCHOOL)
  const preferences: Preferences = { ...DEFAULT_PREFERENCES, goals: ['engineering', 'stem'], rigor: 'very-rigorous' }
  const history: Placement[] = [{ courseId: 'algebra-1', term: -1, status: 'completed' }]
  const student = { startTerm: 0 }
  const result = generatePlan({ catalog, student, history, preferences })
  const plan = result.plan
  const progress = allocateRequirements(catalog, plan.placements)

  const focusId = plan.placements.some((p) => p.courseId === 'ap-calculus-bc') ? 'ap-calculus-bc' : 'ap-precalculus'
  const focus = plan.placements.find((p) => p.courseId === focusId)!
  const explanation = explainPlacement(catalog, student, plan, focus, {
    reasons: result.reasons[`${focus.courseId}@${focus.term}`],
    progress,
  })
  const blocked = whyNot(catalog, { startTerm: 4 }, { placements: history }, 'multivariable-calculus')

  const scienceSwap = plan.placements.find((p) => p.courseId === 'ap-physics-2')
  const scenario = scienceSwap
    ? runScenario(catalog, student, preferences, plan, { kind: 'replace', courseId: 'ap-physics-2', withCourseId: 'ap-chemistry' })
    : null

  const used = new Set(plan.placements.map((p) => p.courseId))
  const school: SchoolConfig = { ...DEMO_SCHOOL, courses: DEMO_SCHOOL.courses.filter((c) => used.has(c.id)) }

  return {
    school,
    placements: plan.placements,
    focusKey: `${focus.courseId}@${focus.term}`,
    status: result.status,
    stages: result.stages,
    explanation: { course: catalog.courses.get(focusId)!.name, headline: explanation.headline, facts: explanation.facts.slice(0, 4).map((f) => f.text) },
    blocked: blocked.explanation,
    scenario: scenario
      ? {
          title: scenario.title,
          status: scenario.status,
          downstream: scenario.comparison.downstream.slice(0, 4).map((d) => d.text),
          prerequisites: scenario.comparison.prerequisiteEffects.slice(0, 3).map((d) => d.text),
          requirements: scenario.comparison.requirementChanges.map((r) => `${r.name}: ${r.before.covered} → ${r.after.covered} credits planned`),
        }
      : null,
  }
}
