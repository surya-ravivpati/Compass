import type { CheckStatus } from '@/lib/engine'
import { IconAlert, IconBlocked, IconCheckCircle, IconInfo } from './icons'

const LABEL: Record<CheckStatus, string> = { valid: 'Valid', attention: 'Needs a look', invalid: 'Conflict' }

/** Status never relies on colour alone: icon + words, always. */
export function StatusIcon({ status, size = 16 }: { status: CheckStatus | 'info'; size?: number }) {
  if (status === 'valid') return <IconCheckCircle size={size} className="text-ok shrink-0" />
  if (status === 'attention') return <IconAlert size={size} className="text-warn shrink-0" />
  if (status === 'invalid') return <IconBlocked size={size} className="text-danger shrink-0" />
  return <IconInfo size={size} className="text-mist shrink-0" />
}

export function StatusLabel({ status, label }: { status: CheckStatus; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <StatusIcon status={status} />
      <span className={status === 'valid' ? 'text-ink' : status === 'attention' ? 'text-warn' : 'text-danger'}>
        {label ?? LABEL[status]}
      </span>
    </span>
  )
}

export function statusWord(status: CheckStatus): string {
  return LABEL[status]
}
