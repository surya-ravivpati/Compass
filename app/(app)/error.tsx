'use client'

import Link from 'next/link'

/** A page failed to load. Say so plainly; nothing about the plan changed. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-[620px] px-5 py-20 md:px-8">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 text-[26px] font-semibold">Compass couldn’t load this page.</h1>
      <p className="mt-3 text-mist">Your plan has not been modified. Try again, or head back to your overview.</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/home" className="btn btn-ghost">
          Home
        </Link>
      </div>
    </main>
  )
}
