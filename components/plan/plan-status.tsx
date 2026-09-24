import type { ValidationReport } from '@/lib/engine'
import { StatusIcon } from '@/components/ui/status'

const PRIMARY = ['requirements', 'prerequisites', 'availability', 'reachability'] as const

/**
 * Deterministic validation status. No percentages or confidence scores: each
 * line is a check that either holds or doesn't.
 */
export function PlanStatus({ validation, compact = false }: { validation: ValidationReport; compact?: boolean }) {
  const primary = validation.checks.filter((c) => (PRIMARY as readonly string[]).includes(c.id))
  const secondary = validation.checks.filter((c) => !(PRIMARY as readonly string[]).includes(c.id))
  return (
    <div>
      <p className="flex items-center gap-2 text-[15px] font-medium">
        <StatusIcon status={validation.graduationPathValid ? 'valid' : 'invalid'} size={18} />
        Graduation path: {validation.graduationPathValid ? 'Valid' : 'Not valid yet'}
      </p>
      <ul className={`mt-3 space-y-2 ${compact ? 'text-[13px]' : 'text-sm'}`}>
        {[...primary, ...(compact ? [] : secondary)].map((c) => {
          const errors = c.findings.filter((f) => f.severity === 'error').length
          const warnings = c.findings.filter((f) => f.severity === 'warning').length
          return (
            <li key={c.id} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-mist">
                <StatusIcon status={c.status} size={14} />
                {c.label}
              </span>
              <span className={`tabular ${c.status === 'valid' ? 'text-fog' : c.status === 'attention' ? 'text-warn' : 'text-danger'}`}>
                {c.status === 'valid'
                  ? c.id === 'requirements'
                    ? requirementWord(validation)
                    : 'Valid'
                  : errors
                    ? `${errors} to fix`
                    : `${warnings} to review`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function requirementWord(validation: ValidationReport): string {
  const all = validation.progress.requirements
  if (all.every((r) => r.status === 'complete')) return 'Complete'
  return 'Covered by plan'
}
