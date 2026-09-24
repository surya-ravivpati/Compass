'use client'

import { useMemo, useState } from 'react'
import { buildCatalog, type Finding, type Placement, type SchoolConfig } from '@/lib/engine'
import { PathMap } from '@/components/map/path-map'

export function PlanOverview({
  school,
  placements,
  startTerm,
  findings,
  compact = true,
}: {
  school: SchoolConfig
  placements: Placement[]
  startTerm: number
  findings: Finding[]
  compact?: boolean
}) {
  const catalog = useMemo(() => buildCatalog(school), [school])
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <PathMap
      catalog={catalog}
      placements={placements}
      startTerm={startTerm}
      findings={findings}
      selected={selected}
      onSelect={setSelected}
      compact={compact}
      label="Four-year overview"
    />
  )
}
