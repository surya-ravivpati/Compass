import type { Metadata } from 'next'
import Link from 'next/link'
import { academicYearLabel, whereNow } from '@/lib/calendar'
import { getDb } from '@/lib/db/client'
import { listVersions } from '@/lib/data/plans'
import { coursesInTerm, planInsights } from '@/lib/insights'
import { termLabel } from '@/lib/engine'
import { loadWorkspace } from '@/lib/workspace'
import { PlanOverview } from '@/components/plan/plan-overview'
import { PlanStatus } from '@/components/plan/plan-status'
import { fmt, RequirementBars } from '@/components/requirements/requirement-list'
import { IconAlert, IconArrowRight, IconInfo } from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Home' }

export default async function HomePage() {
  const ws = await loadWorkspace()
  const { student } = ws.viewer
  const startTerm = student.startTerm ?? 0
  const { catalog, validation, workloadNotes } = planInsights(ws.school, startTerm, ws.plan.placements, student.preferences)
  const now = whereNow(student, new Date())
  const total = validation.progress.total
  const db = await getDb()
  const versions = (await listVersions(db, student.id, ws.plan.id)).slice(0, 4)

  const thisTerm = now.term ?? startTerm
  const nextTerm = Math.max(startTerm, thisTerm + 1)
  const current = thisTerm < 8 ? coursesInTerm(catalog, ws.plan.placements, thisTerm) : []
  const upcoming = nextTerm < 8 ? coursesInTerm(catalog, ws.plan.placements, nextTerm) : []
  const attention = validation.findings.filter((f) => f.severity !== 'info').slice(0, 4)

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
      <header className="animate-rise">
        <p className="eyebrow">
          {ws.school.name}
          {ws.school.isDemo ? ' · demo catalog' : ''} · Class of {student.graduationYear}
        </p>
        <h1 className="mt-3 text-[30px] font-semibold leading-tight md:text-[38px]">Your path, mapped.</h1>
        <p className="mt-2 max-w-[560px] text-mist">Your four years of high school, organized around where you want to go.</p>
      </header>

      <section aria-label="Current status" className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        <Stat label="Grade" value={`${student.grade}th`} detail={student.academicYear ? `${academicYearLabel(student.academicYear)} school year` : ''} />
        <Stat label="Right now" value={now.label} detail={now.term === null ? 'Planning starts with the fall' : 'Current semester'} small />
        <Stat
          label="Credits completed"
          value={`${fmt(total.completed)}`}
          detail={`of ${fmt(total.required)} · ${fmt(Math.max(0, total.required - total.completed))} to go`}
        />
        <Stat
          label="Graduation path"
          value={validation.graduationPathValid ? 'Valid' : 'Needs work'}
          detail={validation.graduationPathValid ? 'Every hard constraint holds' : `${validation.findings.filter((f) => f.severity === 'error').length} conflicts to fix`}
          tone={validation.graduationPathValid ? 'ok' : 'danger'}
          small
        />
      </section>

      <section aria-labelledby="overview-title" className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="overview-title" className="text-lg font-semibold">
              Four-year map
            </h2>
            <p className="text-sm text-mist">
              {ws.plan.name} · version {ws.plan.version}
            </p>
          </div>
          <Link href="/plan" className="btn btn-ghost btn-sm">
            Open My Plan <IconArrowRight size={14} />
          </Link>
        </div>
        <div className="surface mt-3 p-2 md:p-3">
          <PlanOverview school={ws.school} placements={ws.plan.placements} startTerm={startTerm} findings={validation.findings} />
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="status-title" className="surface p-5">
          <h2 id="status-title" className="eyebrow">
            Plan status
          </h2>
          <div className="mt-4">
            <PlanStatus validation={validation} compact />
          </div>
          {attention.length ? (
            <ul className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
              {attention.map((f) => (
                <li key={f.id} className="flex gap-2 text-mist">
                  {f.severity === 'error' ? <IconAlert size={14} className="mt-0.5 shrink-0 text-danger" /> : <IconInfo size={14} className="mt-0.5 shrink-0 text-warn" />}
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="req-title" className="surface p-5">
          <div className="flex items-center justify-between">
            <h2 id="req-title" className="eyebrow">
              Requirements
            </h2>
            <Link href="/requirements" className="text-xs text-mist hover:text-ink">
              Details
            </Link>
          </div>
          <div className="mt-4">
            <RequirementBars progress={validation.progress} compact />
          </div>
        </section>

        <section aria-labelledby="next-title" className="surface p-5">
          <h2 id="next-title" className="eyebrow">
            {now.term === null ? 'Coming up' : 'This semester and next'}
          </h2>
          {current.length ? <TermList title={termLabel(thisTerm)} items={current.map((c) => c.course.name)} /> : null}
          {upcoming.length && nextTerm !== thisTerm ? <TermList title={termLabel(nextTerm)} items={upcoming.map((c) => c.course.name)} /> : null}
          {!current.length && !upcoming.length ? <p className="mt-4 text-sm text-mist">Nothing left to plan — you’re in your final stretch.</p> : null}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="workload-title" className="surface p-5">
          <h2 id="workload-title" className="eyebrow">
            Workload tradeoffs
          </h2>
          {workloadNotes.length ? (
            <ul className="mt-4 space-y-2.5 text-sm text-mist">
              {workloadNotes.map((n) => (
                <li key={n.term} className="flex gap-2">
                  <IconInfo size={15} className="mt-0.5 shrink-0" />
                  {n.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-mist">No semester stands out as unusually heavy.</p>
          )}
          <p className="mt-4 text-xs text-fog">Based on the catalog’s workload estimates. These are notes, not rules.</p>
        </section>

        <section aria-labelledby="changes-title" className="surface p-5">
          <h2 id="changes-title" className="eyebrow">
            Recent changes
          </h2>
          <ol className="mt-4 space-y-3 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-baseline justify-between gap-4">
                <span>
                  <span className="mr-2 font-mono text-xs text-fog">v{v.version}</span>
                  {v.summary}
                </span>
                <time className="shrink-0 text-xs text-fog" dateTime={v.createdAt.toISOString()}>
                  {v.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}

function Stat({
  label,
  value,
  detail,
  tone,
  small = false,
}: {
  label: string
  value: string
  detail?: string
  tone?: 'ok' | 'danger'
  small?: boolean
}) {
  return (
    <div className="bg-carbon p-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-semibold tabular tracking-tight ${small ? 'text-[20px]' : 'text-[28px]'} ${tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : ''}`}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-[13px] text-fog">{detail}</p> : null}
    </div>
  )
}

function TermList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[13px] text-fog">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
