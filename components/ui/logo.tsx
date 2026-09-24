/** The Compass mark: a route rising to a single blue destination. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19.5L9.5 13.5L13.5 15.5L20 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="4" cy="19.5" r="1.9" fill="currentColor" />
      <circle cx="9.5" cy="13.5" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="13.5" cy="15.5" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="20" cy="5.5" r="2.6" fill="#2F8CFF" />
    </svg>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Compass</span>
    </span>
  )
}
