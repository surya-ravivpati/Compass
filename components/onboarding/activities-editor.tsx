'use client'

import { useState } from 'react'
import type { Activity, ActivitySeason } from '@/lib/engine'
import { SEASONS } from '@/lib/goals'
import { IconPlus, IconX } from '@/components/ui/icons'

export function ActivitiesEditor({ value, onChange }: { value: Activity[]; onChange: (v: Activity[]) => void }) {
  const [draft, setDraft] = useState<Activity>({ name: '', kind: 'sport', seasons: [], hoursPerWeek: 10 })
  const valid = draft.name.trim().length > 0 && draft.seasons.length > 0 && draft.hoursPerWeek > 0
  const toggleSeason = (s: ActivitySeason) =>
    setDraft((d) => ({ ...d, seasons: d.seasons.includes(s) ? d.seasons.filter((x) => x !== s) : [...d.seasons, s] }))
  return (
    <div className="space-y-4">
      {value.length ? (
        <ul className="space-y-2">
          {value.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <span>
                <span className="font-medium">{a.name}</span>
                <span className="ml-2 text-sm text-mist">
                  {a.seasons.map((s) => SEASONS.find((x) => x.id === s)?.label).join(', ')} · {a.hoursPerWeek} hrs/week
                </span>
              </span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`}>
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rounded-xl border border-line p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <input className="field" placeholder="Varsity soccer, robotics club, part-time job…" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Activity name" />
          <select className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Activity['kind'] })} aria-label="Kind of activity">
            <option value="sport">Sport</option>
            <option value="club">Club</option>
            <option value="job">Job</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SEASONS.map((s) => (
            <button key={s.id} type="button" aria-pressed={draft.seasons.includes(s.id)} onClick={() => toggleSeason(s.id)} className="chip h-8 text-[13px]">
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-mist">
            <input
              type="number"
              min={1}
              max={60}
              className="field h-8 w-16 px-2 text-sm"
              value={draft.hoursPerWeek}
              onChange={(e) => setDraft({ ...draft, hoursPerWeek: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
              aria-label="Hours per week"
            />
            hrs / week
          </label>
        </div>
        <button
          type="button"
          disabled={!valid || value.length >= 8}
          onClick={() => {
            onChange([...value, { ...draft, name: draft.name.trim() }])
            setDraft({ name: '', kind: 'sport', seasons: [], hoursPerWeek: 10 })
          }}
          className="btn btn-ghost btn-sm mt-3"
        >
          <IconPlus size={14} /> Add commitment
        </button>
      </div>
    </div>
  )
}
