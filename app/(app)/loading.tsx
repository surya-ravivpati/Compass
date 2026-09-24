export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-3 w-40 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-4 h-8 w-72 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.035]" />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-2xl bg-white/[0.035]" />
    </div>
  )
}
