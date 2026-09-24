/**
 * Segmented progress: completed (solid), in progress (strong tint), planned
 * (hatched), remaining (track). Each segment is labelled for screen readers.
 */
export function ProgressSegments({
  required,
  completed,
  inProgress,
  planned,
  label,
  size = 'md',
}: {
  required: number
  completed: number
  inProgress: number
  planned: number
  label: string
  size?: 'sm' | 'md'
}) {
  const total = Math.max(required, 0.0001)
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`
  const clampPlanned = Math.max(0, Math.min(planned, required - completed - inProgress))
  const clampInProgress = Math.max(0, Math.min(inProgress, required - completed))
  const clampCompleted = Math.min(completed, required)
  const h = size === 'sm' ? 'h-1.5' : 'h-2'
  return (
    <div
      role="img"
      aria-label={`${label}: ${clampCompleted} completed, ${clampInProgress} in progress, ${clampPlanned} planned, of ${required} required`}
      className={`flex ${h} w-full overflow-hidden rounded-full bg-white/[0.06]`}
    >
      <span className="h-full bg-signal transition-[width] duration-700 ease-out" style={{ width: pct(clampCompleted) }} />
      <span className="h-full bg-signal/55 transition-[width] duration-700 ease-out" style={{ width: pct(clampInProgress) }} />
      <span
        className="h-full transition-[width] duration-700 ease-out"
        style={{
          width: pct(clampPlanned),
          backgroundImage:
            'repeating-linear-gradient(135deg, rgb(47 140 255 / 0.55) 0 2px, rgb(47 140 255 / 0.18) 2px 5px)',
        }}
      />
    </div>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fog">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-signal" /> Completed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-signal/55" /> In progress
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-3 rounded-sm"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgb(47 140 255 / 0.55) 0 2px, rgb(47 140 255 / 0.18) 2px 5px)' }}
        />{' '}
        Planned
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm bg-white/[0.08]" /> Remaining
      </span>
    </div>
  )
}
