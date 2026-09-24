import type { ProgressReport, RequirementStatus } from '@/lib/engine'
import { ProgressSegments } from '@/components/ui/progress'

export const REQUIREMENT_STATUS: Record<RequirementStatus, string> = {
  complete: 'Complete',
  'in-progress': 'In progress',
  'on-track': 'Planned',
  missing: 'Missing',
}

export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export function RequirementBars({ progress, compact = false }: { progress: ProgressReport; compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-3.5' : 'space-y-5'}>
      {progress.requirements.map((r) => {
        const covered = r.completed + r.inProgress + r.planned
        return (
          <li key={r.requirement.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={compact ? 'text-[13px]' : 'text-sm'}>{r.requirement.name}</span>
              <span className={`tabular ${compact ? 'text-[12px]' : 'text-[13px]'} ${r.status === 'missing' ? 'text-danger' : 'text-mist'}`}>
                {fmt(Math.min(covered, r.required))}/{fmt(r.required)}
                {!compact ? <span className="ml-2 text-fog">{REQUIREMENT_STATUS[r.status]}</span> : null}
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressSegments
                size={compact ? 'sm' : 'md'}
                label={r.requirement.name}
                required={r.required}
                completed={r.completed}
                inProgress={r.inProgress}
                planned={r.planned}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
