'use client'

import { useState, useTransition } from 'react'
import { courseName, diffPlans, placementPhrase, type Catalog, type Placement } from '@/lib/engine'
import { getVersionAction } from '@/app/(app)/plan/actions'
import { Dialog } from '@/components/ui/dialog'
import { StatusIcon } from '@/components/ui/status'

export interface VersionItem {
  id: string
  version: number
  summary: string
  createdAt: string
  validationStatus: string
}

export function HistoryDialog({
  open,
  onClose,
  catalog,
  versions,
  current,
  currentVersion,
  onRestore,
}: {
  open: boolean
  onClose: () => void
  catalog: Catalog
  versions: VersionItem[]
  current: Placement[]
  currentVersion: number
  onRestore: (versionId: string) => void
}) {
  const [comparing, setComparing] = useState<{ version: number; lines: string[] } | null>(null)
  const [pending, startTransition] = useTransition()
  const compare = (id: string) =>
    startTransition(async () => {
      const v = await getVersionAction(id)
      if (!v) return
      const planned = current.filter((p) => p.status === 'planned')
      const diff = diffPlans({ placements: v.placements }, { placements: planned })
      const dur = (cid: string) => catalog.courses.get(cid)?.durationTerms ?? 1
      const lines = [
        ...diff.added.map((p) => `Added since: ${courseName(catalog, p.courseId)} (${placementPhrase(p.term, dur(p.courseId))})`),
        ...diff.removed.map((p) => `Removed since: ${courseName(catalog, p.courseId)} (${placementPhrase(p.term, dur(p.courseId))})`),
        ...diff.moved.map((m) => `Moved: ${courseName(catalog, m.courseId)}, ${placementPhrase(m.fromTerm, dur(m.courseId))} → ${placementPhrase(m.toTerm, dur(m.courseId))}`),
      ]
      setComparing({ version: v.version, lines })
    })
  return (
    <Dialog open={open} onClose={onClose} title="Version history" description="Every change is saved as a version. Restoring adds a new version; nothing is erased." wide>
      <ol className="divide-y divide-line rounded-xl border border-line">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="font-mono text-xs text-fog">v{v.version}</span>
              <StatusIcon status={v.validationStatus as 'valid' | 'attention' | 'invalid'} size={14} />
              <span className="text-sm">{v.summary}</span>
            </div>
            <div className="flex items-center gap-2">
              <time className="text-xs text-fog" dateTime={v.createdAt}>
                {new Date(v.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </time>
              {v.version !== currentVersion ? (
                <>
                  <button type="button" className="btn btn-quiet btn-sm" disabled={pending} onClick={() => compare(v.id)}>
                    Compare
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRestore(v.id)}>
                    Restore
                  </button>
                </>
              ) : (
                <span className="text-xs text-mist">Current</span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {comparing ? (
        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="text-sm font-medium">Version {comparing.version} compared with now</p>
          {comparing.lines.length ? (
            <ul className="mt-2 space-y-1 text-sm text-mist">
              {comparing.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-mist">No differences in planned courses.</p>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}
