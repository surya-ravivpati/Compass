'use client'

import { useMemo, useState } from 'react'
import { buildCatalog, type Placement, type SchoolConfig } from '@/lib/engine'
import { PathMap } from '@/components/map/path-map'

export function SamplePlan({ school, placements, focusKey }: { school: SchoolConfig; placements: Placement[]; focusKey: string }) {
  const catalog = useMemo(() => buildCatalog(school), [school])
  const [selected, setSelected] = useState<string | null>(focusKey)
  return (
    <PathMap
      catalog={catalog}
      placements={placements}
      startTerm={0}
      selected={selected}
      onSelect={setSelected}
      label="Sample four-year plan"
    />
  )
}
