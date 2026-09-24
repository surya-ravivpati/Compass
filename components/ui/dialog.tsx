'use client'

import { useEffect, useRef } from 'react'
import { IconX } from './icons'

/** Native <dialog>: focus trapping, Escape, and inertness come from the platform. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border border-line-strong bg-obsidian p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px] open:animate-rise`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-mist">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="btn btn-quiet btn-sm -mr-2" aria-label="Close">
          <IconX />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  )
}
