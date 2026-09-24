'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { buildCatalog, validatePlan, type SchoolConfig } from '@/lib/engine'
import type { OnboardingResult } from '@/app/onboarding/actions'
import { PathMap } from '@/components/map/path-map'
import { IconArrowRight, IconCheck } from '@/components/ui/icons'
import { StatusIcon } from '@/components/ui/status'
import { Logo } from '@/components/ui/logo'

type Done = Extract<OnboardingResult, { ok: true }>

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

/**
 * The first plan reveal. Each stage shown is one the generator actually ran,
 * with the numbers it produced; the map then builds year by year.
 */
export function Reveal({ school, result, firstName }: { school: SchoolConfig; result: Done; firstName: string }) {
  const catalog = useMemo(() => buildCatalog(school), [school])
  const validation = useMemo(
    () => validatePlan(catalog, { startTerm: result.startTerm }, { placements: result.placements }),
    [catalog, result],
  )
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [stage, setStage] = useState(reduced ? result.stages.length : 0)
  const [years, setYears] = useState(reduced ? 4 : 0)

  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    result.stages.forEach((_, i) => timers.push(setTimeout(() => setStage(i + 1), 520 * (i + 1))))
    const mapStart = 520 * (result.stages.length + 1)
    for (let y = 1; y <= 4; y++) timers.push(setTimeout(() => setYears(y), mapStart + 480 * (y - 1)))
    return () => timers.forEach(clearTimeout)
  }, [reduced, result.stages])

  const mapping = stage < result.stages.length
  const complete = years === 4
  const valid = result.status === 'valid'
  const keyChecks = validation.checks.filter((c) => ['requirements', 'prerequisites', 'availability', 'reachability'].includes(c.id))

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1520px] items-center px-5 pt-5 md:px-8">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[1520px] px-5 pb-16 pt-10 md:px-8 md:pt-14">
        <div className="grid gap-10 xl:grid-cols-[280px_1fr]">
          <aside aria-live="polite">
            <p className="eyebrow">{mapping ? 'Working' : complete ? 'Done' : 'Building'}</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight md:text-[34px]">
              {complete ? (valid ? `Your path is ready${firstName ? `, ${firstName}` : ''}.` : 'Your plan needs attention.') : 'Mapping your path…'}
            </h1>
            <ol className="mt-8 space-y-4">
              {result.stages.map((s, i) => {
                const done = i < stage
                return (
                  <li key={s.id} className={`flex gap-3 transition-opacity duration-500 ${i <= stage ? 'opacity-100' : 'opacity-30'}`}>
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-signal bg-signal text-white' : 'border-line-strong'}`}>
                      {done ? <IconCheck size={12} /> : i === stage ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" /> : null}
                    </span>
                    <span>
                      <span className="block text-[15px]">{s.label}</span>
                      {done ? <span className="mt-0.5 block text-[13px] text-fog tabular animate-fade">{s.detail}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ol>

            {complete ? (
              <div className="mt-10 animate-rise">
                <div className="rounded-xl border border-line p-4">
                  <p className="flex items-center gap-2 text-[15px] font-medium">
                    <StatusIcon status={validation.graduationPathValid ? 'valid' : 'invalid'} />
                    Graduation path: {validation.graduationPathValid ? 'Valid' : 'Not yet valid'}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {keyChecks.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-mist">
                        <StatusIcon status={c.status} size={14} />
                        {c.label}: {c.status === 'valid' ? 'Valid' : c.status === 'attention' ? 'Needs a look' : `${c.findings.filter((f) => f.severity === 'error').length} to fix`}
                      </li>
                    ))}
                  </ul>
                </div>
                {!valid && result.problems.length ? (
                  <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
                    <p className="font-medium text-danger">No valid schedule found. Here’s why:</p>
                    <ul className="mt-2 space-y-1.5 text-ink/90">
                      {result.problems.map((p) => (
                        <li key={p.id}>{p.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.notes.length ? (
                  <ul className="mt-4 space-y-1.5 text-sm text-mist">
                    {result.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link href="/plan" className="btn btn-primary h-11 px-5">
                    Open my plan <IconArrowRight />
                  </Link>
                  <Link href="/home" className="btn btn-ghost h-11 px-5">
                    Overview
                  </Link>
                </div>
              </div>
            ) : null}
          </aside>

          <section aria-label="Your four-year plan" className={`transition-opacity duration-700 ${years > 0 ? 'opacity-100' : 'opacity-0'}`}>
            <div className="mb-3 flex items-center gap-2 text-sm text-fog">
              {YEARS.map((y, i) => (
                <span key={y} className={`flex items-center gap-2 transition-colors duration-500 ${i < years ? 'text-ink' : ''}`}>
                  {i > 0 ? <span aria-hidden="true">→</span> : null}
                  {y}
                </span>
              ))}
            </div>
            <div className="surface p-3 md:p-4">
              <PathMap catalog={catalog} placements={result.placements} startTerm={result.startTerm} findings={validation.findings} revealYears={years} animateIn />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
