'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { IconMessage, IconX } from '@/components/ui/icons'
import { AssistantPanel } from './assistant-panel'

/** "Ask Compass" from anywhere: a side drawer on desktop. */
export function AssistantLauncher({ aiEnabled, suggestions }: { aiEnabled: boolean; suggestions: string[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  if (pathname === '/assistant') return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-full border border-line-strong bg-graphite/95 px-4 py-2.5 text-sm shadow-2xl shadow-black/40 backdrop-blur transition-colors hover:border-signal-line lg:inline-flex"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
        Ask Compass
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false)
        }}
        aria-label="Compass AI"
        className="ml-auto mr-0 mt-0 h-dvh max-h-dvh w-full max-w-[440px] border-l border-line-strong bg-obsidian p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 font-medium">
              <IconMessage className="text-signal" /> Compass AI
            </p>
            <button type="button" className="btn btn-quiet btn-sm -mr-2" onClick={() => setOpen(false)} aria-label="Close Compass AI">
              <IconX />
            </button>
          </div>
          {open ? <AssistantPanel aiEnabled={aiEnabled} suggestions={suggestions} compact /> : null}
        </div>
      </dialog>
    </>
  )
}
