import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import {
  allocateRequirements,
  explainPlacement,
  GOAL_LABELS,
  GOAL_TAGS,
  gradeList,
  placementPhrase,
  whyNot,
  type GoalId,
} from '@/lib/engine'
import { planInsights } from '@/lib/insights'
import { loadWorkspace } from '@/lib/workspace'
import { CourseExplainer } from '@/components/explore/course-explainer'
import { IconArrowLeft, IconArrowRight, IconBranch } from '@/components/ui/icons'

const LEVEL: Record<string, string> = { standard: 'Standard', honors: 'Honors', ap: 'AP', 'post-ap': 'College level' }
const WORKLOAD = ['', 'Light', 'Moderate', 'Heavy', 'Intense']

export async function generateMetadata(props: PageProps<'/explore/[courseId]'>): Promise<Metadata> {
  const { courseId } = await props.params
  const ws = await loadWorkspace()
  const course = ws.school.courses.find((c) => c.id === courseId)
  return { title: course?.name ?? 'Course' }
}

export default async function CoursePage(props: PageProps<'/explore/[courseId]'>) {
  const { courseId } = await props.params
  const ws = await loadWorkspace()
  const student = ws.viewer.student
  const startTerm = student.startTerm ?? 0
  const { catalog } = planInsights(ws.school, startTerm, ws.plan.placements, student.preferences)
  const course = catalog.courses.get(courseId)
  if (!course) notFound()

  const plan = { placements: ws.plan.placements }
  const placement = plan.placements.find((p) => p.courseId === course.id)
  const progress = allocateRequirements(catalog, plan.placements)
  const explanation = placement
    ? explainPlacement(catalog, { startTerm }, plan, placement, { reasons: ws.plan.reasons[`${placement.courseId}@${placement.term}`], progress })
    : null
  const why = placement ? null : whyNot(catalog, { startTerm }, plan, course.id)
  const dependents = (catalog.dependents.get(course.id) ?? []).map((id) => catalog.courses.get(id)!).filter(Boolean)
  const requirementNames = course.satisfies.map((id) => catalog.requirements.get(id)?.name).filter((n): n is string => !!n)
  const goals = (Object.entries(GOAL_TAGS) as [GoalId, string[]][])
    .filter(([, tags]) => tags.some((t) => course.tags.includes(t)))
    .map(([goal]) => goal)
  const yourGoals = goals.filter((g) => student.preferences.goals.includes(g))
  const equivalents = course.equivalenceGroup ? (catalog.equivalents.get(course.equivalenceGroup) ?? []).filter((id) => id !== course.id) : []
  const sequence = course.sequence ? (catalog.sequences.get(course.sequence.id) ?? []) : []

  return (
    <main className="mx-auto max-w-[980px] px-5 py-8 md:px-8 md:py-10">
      <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink">
        <IconArrowLeft size={14} /> Explore
      </Link>
      <header className="mt-5">
        <p className="eyebrow">{catalog.departments.get(course.department)?.name}</p>
        <h1 className="mt-2 text-[30px] font-semibold leading-tight md:text-[38px]">{course.name}</h1>
        <p className="mt-2 text-mist">
          {LEVEL[course.level]} · {course.durationTerms === 2 ? 'Full year' : 'One semester'} · {course.credits} credit{course.credits === 1 ? '' : 's'} · Open to{' '}
          {gradeList(course.grades)}
        </p>
      </header>

      <section aria-label="In your plan" className="surface mt-6 p-5">
        {placement && explanation ? (
          <>
            <p className="eyebrow">
              {placement.status === 'completed' ? 'Completed' : placement.status === 'in-progress' ? 'Taking it now' : 'In your plan'}
              {placement.term >= 0 ? ` · ${placementPhrase(placement.term, course.durationTerms)}` : ''}
            </p>
            <p className="mt-2 text-[16px] leading-relaxed">{explanation.headline}</p>
            {placement.status === 'planned' ? (
              <Link href={`/plan?course=${course.id}` as Route} className="mt-3 inline-flex items-center gap-1.5 text-sm text-signal-hi hover:underline">
                See it in your plan <IconArrowRight size={14} />
              </Link>
            ) : null}
          </>
        ) : why ? (
          <>
            <p className="eyebrow">{why.reachable ? 'Not in your plan' : 'Out of reach'}</p>
            <p className="mt-2 text-[16px] leading-relaxed">{why.explanation}</p>
            {why.reachable ? (
              <Link href={`/what-if?kind=add&course=${course.id}` as Route} className="btn btn-ghost btn-sm mt-4">
                <IconBranch size={14} /> What if I add it?
              </Link>
            ) : null}
          </>
        ) : null}
      </section>

      <p className="mt-6 max-w-[720px] text-[16px] leading-relaxed text-mist">{course.description}</p>

      <section aria-labelledby="path-title" className="mt-8">
        <h2 id="path-title" className="eyebrow">
          The path through it
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs text-fog">Before</p>
            {course.prerequisites.length ? (
              <ul className="mt-2 space-y-2">
                {course.prerequisites.map((g, i) => (
                  <li key={i} className="text-sm">
                    {g.anyOf.map((o, j) => (
                      <span key={o.courseId}>
                        {j > 0 ? <span className="text-fog"> or </span> : null}
                        <Link href={`/explore/${o.courseId}` as Route} className="hover:text-signal-hi">
                          {catalog.courses.get(o.courseId)?.name}
                        </Link>
                        {o.timing !== 'before' ? <span className="text-fog"> ({o.timing === 'concurrent' ? 'same time' : 'or same time'})</span> : null}
                      </span>
                    ))}
                    {g.note ? <span className="block text-xs text-fog">{g.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mist">No prerequisites.</p>
            )}
          </div>
          <IconArrowRight className="hidden text-fog md:block" />
          <div className="rounded-xl border border-signal bg-signal-soft p-4">
            <p className="text-xs text-fog">This course</p>
            <p className="mt-2 text-sm font-medium">{course.name}</p>
          </div>
          <IconArrowRight className="hidden text-fog md:block" />
          <div className="rounded-xl border border-line p-4">
            <p className="text-xs text-fog">Opens</p>
            {dependents.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {dependents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/explore/${d.id}` as Route} className="hover:text-signal-hi">
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mist">Nothing lists it as a prerequisite.</p>
            )}
          </div>
        </div>
        {why && why.chain.length > 2 ? (
          <p className="mt-3 text-sm text-mist">
            Full chain from where you are: {why.chain.map((id) => catalog.courses.get(id)?.name).join(' → ')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="facts-title" className="mt-8">
        <h2 id="facts-title" className="eyebrow">
          Details
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
          <Fact label="Offered" value={course.durationTerms === 2 ? 'Full year, starts in fall' : course.seasons.map((s) => (s === 'fall' ? 'Fall' : 'Spring')).join(' or ')} />
          <Fact label={course.workloadEstimated ? 'Workload (estimated)' : 'Typical workload'} value={`${WORKLOAD[course.workload]}${course.lab ? ' · lab' : ''}`} />
          <Fact label="Counts toward" value={requirementNames.length ? requirementNames.join(', ') : 'Electives'} />
          <Fact label="Grades" value={gradeList(course.grades)} />
        </dl>
        <p className="mt-2 text-xs text-fog">
          {course.workloadEstimated ? 'The catalog doesn’t state a workload; this is estimated from the course level.' : 'Workload is the catalog’s estimate, not a rule.'}
        </p>
      </section>

      {goals.length || equivalents.length || sequence.length > 1 || course.notes?.length ? (
        <section aria-labelledby="connections-title" className="mt-8 grid gap-4 md:grid-cols-2">
          {goals.length ? (
            <div className="rounded-xl border border-line p-4">
              <h2 id="connections-title" className="eyebrow">
                Connections
              </h2>
              <p className="mt-2 text-sm text-mist">Related to {goals.map((g) => GOAL_LABELS[g]).join(', ')}.</p>
              {yourGoals.length ? <p className="mt-1 text-sm text-signal-hi">Matches your interest in {yourGoals.map((g) => GOAL_LABELS[g]).join(' and ')}.</p> : null}
            </div>
          ) : null}
          {equivalents.length || sequence.length > 1 ? (
            <div className="rounded-xl border border-line p-4">
              <h2 className="eyebrow">Related courses</h2>
              {equivalents.length ? (
                <p className="mt-2 text-sm text-mist">
                  Same material as{' '}
                  {equivalents.map((id, i) => (
                    <span key={id}>
                      {i > 0 ? ', ' : ''}
                      <Link href={`/explore/${id}` as Route} className="text-ink hover:text-signal-hi">
                        {catalog.courses.get(id)?.name}
                      </Link>
                    </span>
                  ))}
                  . Take one of them, not both.
                </p>
              ) : null}
              {sequence.length > 1 ? (
                <p className="mt-2 text-sm text-mist">
                  Sequence: {sequence.map((id) => catalog.courses.get(id)?.name).join(' → ')}
                </p>
              ) : null}
            </div>
          ) : null}
          {course.notes?.length ? (
            <div className="rounded-xl border border-line p-4">
              <h2 className="eyebrow">Catalog notes</h2>
              <ul className="mt-2 space-y-1 text-sm text-mist">
                {course.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {ws.aiEnabled ? <CourseExplainer courseId={course.id} courseName={course.name} /> : null}

      <p className="mt-10 text-xs text-fog">
        Source: {course.source.document}
        {course.source.page ? `, page ${course.source.page}` : ''}
        {course.source.kind === 'seed' ? ' — fictional development data, not a real school’s catalog.' : ''}
      </p>
    </main>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-carbon p-4">
      <dt className="text-xs text-fog">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  )
}

