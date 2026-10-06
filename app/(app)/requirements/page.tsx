import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { placementPhrase, type ProgramProgress, type SourceRef } from '@/lib/engine'
import { planInsights } from '@/lib/insights'
import { loadWorkspace } from '@/lib/workspace'
import { fmt, REQUIREMENT_STATUS } from '@/components/requirements/requirement-list'
import { Legend, ProgressSegments } from '@/components/ui/progress'
import { IconCheck } from '@/components/ui/icons'
import { StatusIcon } from '@/components/ui/status'

export const metadata: Metadata = { title: 'Requirements' }

export default async function RequirementsPage() {
  const ws = await loadWorkspace()
  const student = ws.viewer.student
  const { catalog, validation } = planInsights(ws.school, student.startTerm ?? 0, ws.plan.placements, student.preferences)
  const { progress } = validation
  const total = progress.total
  const where = (courseId: string, term: number) =>
    term < 0 ? 'before high school' : placementPhrase(term, catalog.courses.get(courseId)?.durationTerms ?? 1)

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
      <header>
        <p className="eyebrow">Graduation progress</p>
        <h1 className="mt-2 text-[30px] font-semibold md:text-[36px]">Requirements</h1>
        <p className="mt-2 max-w-[640px] text-mist">
          What {ws.school.name} requires to graduate, and exactly which of your courses count toward each requirement.
          Completed means finished — planned courses never count as met.
        </p>
      </header>

      <section aria-labelledby="total-title" className="surface mt-8 p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="total-title" className="eyebrow">
              Total credits
            </h2>
            <p className="mt-2 text-[34px] font-semibold tabular tracking-tight">
              {fmt(total.completed)}
              <span className="text-[18px] font-normal text-fog"> / {fmt(total.required)} completed</span>
            </p>
          </div>
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-fog">In progress</dt>
              <dd className="tabular">{fmt(total.inProgress)}</dd>
            </div>
            <div>
              <dt className="text-fog">Planned</dt>
              <dd className="tabular">{fmt(total.planned)}</dd>
            </div>
            <div>
              <dt className="text-fog">Still uncovered</dt>
              <dd className={`tabular ${total.remaining > 0 ? 'text-danger' : ''}`}>{fmt(total.remaining)}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-4">
          <ProgressSegments label="Total credits" required={total.required} completed={total.completed} inProgress={total.inProgress} planned={total.planned} />
        </div>
        <div className="mt-3">
          <Legend />
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {progress.requirements.map((r) => {
          const covered = r.completed + r.inProgress + r.planned
          const status = r.status === 'missing' ? 'invalid' : 'valid'
          return (
            <section key={r.requirement.id} aria-labelledby={`req-${r.requirement.id}`} className="surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id={`req-${r.requirement.id}`} className="text-[16px] font-semibold">
                    {r.requirement.name}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-mist">{r.requirement.description}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-[13px]">
                  <StatusIcon status={status} size={14} />
                  <span className={r.status === 'missing' ? 'text-danger' : r.status === 'complete' ? 'text-ok' : 'text-mist'}>{REQUIREMENT_STATUS[r.status]}</span>
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between text-sm">
                <span className="tabular">
                  {fmt(Math.min(covered, r.required))} / {fmt(r.required)} credits
                </span>
                <span className="text-xs text-fog tabular">
                  {fmt(r.completed)} done · {fmt(r.inProgress)} now · {fmt(r.planned)} planned
                </span>
              </div>
              <div className="mt-2">
                <ProgressSegments label={r.requirement.name} required={r.required} completed={r.completed} inProgress={r.inProgress} planned={r.planned} />
              </div>

              {r.mustInclude.length ? (
                <ul className="mt-4 space-y-1.5 text-[13px]">
                  {r.mustInclude.map((m) => (
                    <li key={m.group.label} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        {m.satisfiedBy ? <IconCheck size={14} className="text-ok" /> : <StatusIcon status="invalid" size={14} />}
                        Must include {m.group.label}
                      </span>
                      <span className="text-right text-fog">
                        {m.satisfiedBy ? `${catalog.courses.get(m.satisfiedBy.courseId)?.name}, ${where(m.satisfiedBy.courseId, m.satisfiedBy.term)}` : 'Not in your plan'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {r.allocations.length ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs text-fog">Counting toward it</p>
                  <ul className="mt-2 space-y-1.5 text-[13px]">
                    {r.allocations.map((a) => (
                      <li key={`${a.courseId}@${a.term}`} className="flex items-center justify-between gap-3">
                        <Link href={`/explore/${a.courseId}` as Route} className="truncate hover:text-signal-hi">
                          {catalog.courses.get(a.courseId)?.name}
                        </Link>
                        <span className="shrink-0 text-fog tabular">
                          {a.status === 'completed' ? 'Done' : a.status === 'in-progress' ? 'Now' : where(a.courseId, a.term)} · {fmt(a.credits)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <RequirementSource source={r.requirement.source} />
              {r.status === 'missing' ? (
                <p className="mt-4 text-[13px] text-danger">
                  {r.remaining > 0 ? `Still needs ${fmt(r.remaining)} more credit${r.remaining === 1 ? '' : 's'}.` : 'Still needs a required course.'}{' '}
                  <Link href="/plan" className="link">
                    Adjust your plan
                  </Link>
                </p>
              ) : null}
            </section>
          )
        })}
      </div>

      {validation.programs.map((p) => (
        <ProgramSection
          key={p.program.id}
          progress={p}
          aiming={student.preferences.goals.includes(p.program.goal)}
          courseName={(id) => catalog.courses.get(id)?.name ?? id}
          where={where}
        />
      ))}

      {progress.extra.length ? (
        <section aria-labelledby="extra-title" className="surface mt-6 p-5">
          <h2 id="extra-title" className="eyebrow">
            Beyond the requirements
          </h2>
          <p className="mt-2 text-sm text-mist">Credits from these courses go past what every requirement needs.</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {progress.extra.map((a) => (
              <li key={`${a.courseId}@${a.term}`} className="rounded-md border border-line px-2 py-1 text-xs text-mist">
                {catalog.courses.get(a.courseId)?.name} · {fmt(a.credits)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="how-title" className="mt-6 rounded-2xl border border-line p-5 text-sm text-mist">
        <h2 id="how-title" className="font-medium text-ink">
          How Compass counts credits
        </h2>
        <p className="mt-2">
          Each course’s credits count toward one requirement. A course a requirement names (like U.S. History) counts
          there first. The rest fill the subject requirements, finished courses first, then current ones, then planned
          ones — whichever way covers the most. Anything left over counts as an elective. Courses finished before high
          school satisfy prerequisites but {ws.school.preHighSchoolCredit ? 'also earn credit' : 'don’t earn high-school credit'} at this school.
        </p>
        <p className="mt-2 text-xs text-fog">Source: {ws.school.source.document}</p>
      </section>
    </main>
  )
}

/** Where a requirement comes from: the school's own words and page, when it has them. */
function RequirementSource({ source }: { source: SourceRef }) {
  const where = `${source.document}${source.page ? `, page ${source.page}` : ''}`
  if (source.quote) {
    return (
      <figure className="mt-4 border-t border-line pt-3 text-xs">
        <blockquote className="leading-relaxed text-mist">“{source.quote}”</blockquote>
        <figcaption className="mt-1 text-fog">{where}</figcaption>
      </figure>
    )
  }
  return (
    <p className="mt-4 border-t border-line pt-3 text-xs text-fog">
      Source: {where}
      {source.kind === 'seed' ? ' — fictional development data, not a real school’s requirements.' : ''}
    </p>
  )
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * What a program the school publishes expects (Illinois public universities,
 * say), against the plan. It is never a graduation rule: amber only for a
 * student who asked Compass to aim for it.
 */
function ProgramSection({
  progress,
  aiming,
  courseName,
  where,
}: {
  progress: ProgramProgress
  aiming: boolean
  courseName: (id: string) => string
  where: (courseId: string, term: number) => string
}) {
  const { program, requirements, covered } = progress
  return (
    <section aria-labelledby={`program-${program.id}`} className="surface mt-6 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[680px]">
          <p className="eyebrow">Beyond graduation</p>
          <h2 id={`program-${program.id}`} className="mt-1.5 text-[18px] font-semibold">
            What {program.name} expect
          </h2>
          <p className="mt-1 text-[13px] text-mist">{program.description}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px]">
          {covered ? <StatusIcon status="valid" size={14} /> : aiming ? <StatusIcon status="attention" size={14} /> : null}
          <span className={covered ? 'text-ok' : aiming ? 'text-warn' : 'text-mist'}>{covered ? 'Your plan covers it' : 'Not covered yet'}</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-fog">
        {aiming ? (
          'Compass plans toward this because you chose “Prepare for college.” It is not a graduation requirement.'
        ) : (
          <>
            Not a graduation requirement. Choose “Prepare for college” in{' '}
            <Link href="/settings" className="link">
              Settings
            </Link>{' '}
            and Compass will plan toward it.
          </>
        )}
      </p>
      <ul className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
        {requirements.map((r) => {
          const covering = Math.min(r.completed + r.inProgress + r.planned, r.required)
          return (
            <li key={r.requirement.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{capitalized(r.requirement.name)}</span>
                <span className="tabular text-[13px] text-mist">
                  {fmt(covering)} / {fmt(r.required)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-fog">{r.requirement.description}</p>
              <div className="mt-2">
                <ProgressSegments size="sm" label={capitalized(r.requirement.name)} required={r.required} completed={r.completed} inProgress={r.inProgress} planned={r.planned} />
              </div>
              {r.mustInclude.length ? (
                <ul className="mt-2 space-y-1 text-[12.5px]">
                  {r.mustInclude.map((m) => (
                    <li key={m.group.label} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        {m.satisfiedBy ? (
                          <IconCheck size={13} className="text-ok" />
                        ) : aiming ? (
                          <StatusIcon status="attention" size={13} />
                        ) : (
                          <span className="inline-block h-[13px] w-[13px] rounded-full border border-line-strong" aria-hidden />
                        )}
                        {capitalized(m.group.label)}
                      </span>
                      <span className="text-right text-fog">
                        {m.satisfiedBy ? `${courseName(m.satisfiedBy.courseId)}, ${where(m.satisfiedBy.courseId, m.satisfiedBy.term)}` : 'Not in your plan'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
      <RequirementSource source={program.source} />
    </section>
  )
}
