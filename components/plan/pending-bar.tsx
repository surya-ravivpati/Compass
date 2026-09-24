'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { courseName, describeEdit, joinAnd, type Catalog, type EditPreview } from '@/lib/engine'
import { IconAlert, IconBranch, IconCheckCircle } from '@/components/ui/icons'

/**
 * A staged change and its consequences. Nothing is applied until the student
 * chooses: Compass never silently alters a plan.
 */
export function PendingBar({
  catalog,
  preview,
  busy,
  onApplyCascade,
  onKeep,
  onRevert,
}: {
  catalog: Catalog
  preview: EditPreview
  busy: boolean
  onApplyCascade: () => void
  onKeep: () => void
  onRevert: () => void
}) {
  const affectedNames = [...new Set(preview.affected.map((a) => courseName(catalog, a.courseId)))]
  const clean = preview.introduced.length === 0
  const change = describeEdit(catalog, preview.edit, 'proposed')
  const headline = clean
    ? `${change}: no conflicts.`
    : affectedNames.length
      ? `${change} affects ${joinAnd(affectedNames)}.`
      : `${change} creates ${preview.introduced.length === 1 ? 'a conflict' : `${preview.introduced.length} conflicts`}.`
  const messages = preview.introduced.slice(0, 3).map((f) => f.message)
  const more = preview.introduced.length - messages.length
  // An adjustment that can't fix everything says so instead of implying it does.
  const leftover = preview.cascade?.validation.findings.filter((f) => f.severity === 'error') ?? []
  const edit = preview.edit
  const exploreHref =
    edit.kind === 'move'
      ? `/what-if?kind=move&course=${edit.courseId}&term=${edit.toTerm}`
      : edit.kind === 'replace'
        ? `/what-if?kind=replace&course=${edit.courseId}&with=${edit.withCourseId}`
        : edit.kind === 'remove'
          ? `/what-if?kind=drop&course=${edit.courseId}`
          : `/what-if?kind=add&course=${edit.courseId}`
  return (
    <div role="alertdialog" aria-labelledby="pending-title" aria-describedby="pending-body" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-[760px] animate-rise lg:bottom-6">
      <div className="rounded-2xl border border-line-strong bg-graphite/95 p-4 shadow-2xl shadow-black/50 backdrop-blur md:p-5">
        <p id="pending-title" className="flex items-start gap-2.5 text-[15px] font-medium">
          {clean ? <IconCheckCircle className="mt-0.5 shrink-0 text-ok" /> : <IconAlert className="mt-0.5 shrink-0 text-warn" />}
          {headline}
        </p>
        <div id="pending-body" className="mt-2 space-y-1.5 pl-7 text-sm text-mist">
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
          {more > 0 ? <p className="text-fog">And {more} more.</p> : null}
          {preview.cascade ? <p className="text-ink">Possible adjustment: {preview.cascade.summary}.</p> : null}
          {preview.cascade && leftover.length > 0 ? (
            <p className="text-warn">
              {leftover.length === 1
                ? `Even with it, one problem is left: ${leftover[0]!.message}`
                : `Even with it, ${leftover.length} problems are left, including: ${leftover[0]!.message}`}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 pl-7">
          {preview.cascade ? (
            <button type="button" disabled={busy} onClick={onApplyCascade} className="btn btn-signal btn-sm">
              Apply with adjustments
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onKeep} className={`btn btn-sm ${clean ? 'btn-signal' : 'btn-ghost'}`}>
            {clean ? 'Apply' : 'Keep my change'}
          </button>
          <button type="button" disabled={busy} onClick={onRevert} className="btn btn-ghost btn-sm">
            Revert
          </button>
          <Link href={exploreHref as Route} className="btn btn-quiet btn-sm">
            <IconBranch size={14} /> Explore alternatives
          </Link>
        </div>
      </div>
    </div>
  )
}
