'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '@/lib/engine'
import { IconArrowRight, IconBranch, IconMap, IconSend } from '@/components/ui/icons'

interface Fact {
  text: string
  source: string
}

type Proposal =
  | { kind: 'move'; courseId: string; fromTerm: number; toTerm: number; title: string }
  | { kind: 'scenario'; scenario: Scenario; title: string }

interface Message {
  role: 'user' | 'assistant'
  text: string
  facts?: Fact[]
  proposals?: Proposal[]
  status?: 'ok' | 'error' | 'offline'
}

export function scenarioHref(s: Scenario): string {
  switch (s.kind) {
    case 'replace':
      return `/what-if?kind=replace&course=${s.courseId}&with=${s.withCourseId}`
    case 'move':
      return `/what-if?kind=move&course=${s.courseId}&term=${s.toTerm}`
    case 'drop':
      return `/what-if?kind=drop&course=${s.courseIds.join(',')}`
    case 'add':
      return `/what-if?kind=add&course=${s.courseId}`
    case 'preferences':
      return `/what-if?kind=priorities&rigor=${s.preferences.rigor}&goals=${s.preferences.goals.join(',')}`
  }
}

export function AssistantPanel({
  aiEnabled,
  suggestions,
  compact = false,
}: {
  aiEnabled: boolean
  suggestions: string[]
  compact?: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [offline, setOffline] = useState(!aiEnabled)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || pending) return
    const next: Message[] = [...messages, { role: 'user', text: question }]
    setMessages(next)
    setInput('')
    setPending(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m.status !== 'error').map((m) => ({ role: m.role, text: m.text })) }),
      })
      const data = await res.json()
      if (data.status === 'offline') {
        setOffline(true)
        setMessages(messages)
        return
      }
      if (!res.ok && !data.text) throw new Error(data.error ?? 'error')
      setMessages([...next, { role: 'assistant', text: data.text, facts: data.facts, proposals: data.proposals, status: data.status }])
    } catch {
      setMessages([...next, { role: 'assistant', text: 'Compass AI couldn’t be reached. Your plan hasn’t changed.', status: 'error' }])
    } finally {
      setPending(false)
    }
  }

  if (offline) {
    return (
      <div className="rounded-2xl border border-line p-5">
        <p className="flex items-center gap-2 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-fog" aria-hidden="true" /> Compass AI is offline
        </p>
        <p className="mt-2 text-sm text-mist">
          This Compass server doesn’t have a Gemini API key configured, so the conversational assistant is turned off. Everything
          else works without it: your plan, validation, explanations for every course, requirements, and What If.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link href="/plan" className="link">
              Select any course in My Plan
            </Link>{' '}
            <span className="text-mist">to see why it’s there, what it needs, and what it opens.</span>
          </li>
          <li>
            <Link href="/what-if" className="link">
              Open What If?
            </Link>{' '}
            <span className="text-mist">to compare another route side by side.</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-fog">For the site owner: set GEMINI_API_KEY in the server environment and restart.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'pr-1' : ''}`} aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm text-mist">
              Ask about your plan. Compass AI answers from your school’s catalog and the Compass engine — it can explain and
              preview changes, but only you can make them.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} className="w-full rounded-xl border border-line-strong px-3.5 py-2.5 text-left text-sm text-mist transition-colors hover:border-signal-line hover:text-ink">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-5">
            {messages.map((m, i) => (
              <li key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                {m.role === 'user' ? (
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-[15px]">{m.text}</p>
                ) : (
                  <div className="animate-fade">
                    <p className="flex items-center gap-2 text-xs text-fog">
                      <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" /> Compass AI
                    </p>
                    <p className={`mt-1.5 whitespace-pre-line text-[15px] leading-relaxed ${m.status === 'error' ? 'text-mist' : ''}`}>{m.text}</p>
                    {m.proposals?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.proposals.map((p) =>
                          p.kind === 'move' ? (
                            <Link key={p.title} href={`/plan?course=${p.courseId}&moveTo=${p.toTerm}` as Route} className="btn btn-ghost btn-sm">
                              <IconMap size={14} /> Preview “{p.title}” in My Plan
                            </Link>
                          ) : (
                            <Link key={p.title} href={scenarioHref(p.scenario) as Route} className="btn btn-ghost btn-sm">
                              <IconBranch size={14} /> Open “{p.title}” in What If
                            </Link>
                          ),
                        )}
                      </div>
                    ) : null}
                    {m.facts?.length ? (
                      <details className="mt-3 text-xs text-fog">
                        <summary className="cursor-pointer select-none hover:text-mist">Based on {m.facts.length} checked fact{m.facts.length === 1 ? '' : 's'}</summary>
                        <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
                          {m.facts.map((f) => (
                            <li key={f.text}>
                              <span className="text-mist">{f.text}</span> <span>— {f.source}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
            {pending ? (
              <li className="flex items-center gap-2 text-sm text-fog">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" aria-hidden="true" /> Checking your plan…
              </li>
            ) : null}
          </ol>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="mt-4 flex items-end gap-2 border-t border-line pt-4"
      >
        <label htmlFor={compact ? 'ask-compass-drawer' : 'ask-compass'} className="sr-only">
          Ask Compass AI
        </label>
        <textarea
          id={compact ? 'ask-compass-drawer' : 'ask-compass'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask about your plan…"
          className="field h-auto max-h-32 min-h-10 resize-none py-2.5"
        />
        <button type="submit" disabled={pending || !input.trim()} className="btn btn-signal h-10 w-10 shrink-0 p-0" aria-label="Send">
          <IconSend />
        </button>
      </form>
    </div>
  )
}

export function AskLink() {
  return (
    <Link href="/assistant" className="inline-flex items-center gap-1 text-sm text-mist hover:text-ink">
      Ask Compass AI <IconArrowRight size={14} />
    </Link>
  )
}
