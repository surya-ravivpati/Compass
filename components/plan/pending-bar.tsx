'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { courseName, joinAnd, type Catalog, type EditPreview } from '@/lib/engine'
import { IconAlert, IconBranch } from '@/components/ui/icons'

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
  const headline = affectedNames.length
    ? `${preview.summary} affects ${joinAnd(affectedNames)}.`
    : `${preview.summary} creates ${preview.introduced.length === 1 ? 'a conflict' : `${preview.introduced.length} conflicts`}.`
  const messages = preview.introduced.slice(0, 3).map((f) => f.message)
  const more = preview.introduced.length - messages.length
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
          <IconAlert className="mt-0.5 shrink-0 text-warn" />
          {headline}
        </p>
        <div id="pending-body" className="mt-2 space-y-1.5 pl-7 text-sm text-mist">
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
          {more > 0 ? <p className="text-fog">And {more} more.</p> : null}
          {preview.cascade ? <p className="text-ink">Possible adjustment: {preview.cascade.summary}.</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 pl-7">
          {preview.cascade ? (
            <button type="button" disabled={busy} onClick={onApplyCascade} className="btn btn-signal btn-sm">
              Apply with adjustments
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onKeep} className="btn btn-ghost btn-sm">
            Keep my change
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
