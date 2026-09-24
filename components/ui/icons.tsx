import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
export const IconCheckCircle = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.8 2.8L16.5 9.5" />
  </svg>
)
export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5L2.8 19.5h18.4L12 3.5z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </svg>
)
export const IconBlocked = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
)
export const IconInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.3" />
  </svg>
)
export const IconX = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const IconArrowLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)
export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
)
export const IconHome = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 10.5L12 4l8 6.5V20H4z" />
    <path d="M10 20v-5h4v5" />
  </svg>
)
export const IconMap = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="6" r="2" />
    <path d="M6.5 16.5l4-4.5 3 2 4-6.5" />
  </svg>
)
export const IconCompassRose = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
)
export const IconLayers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4l8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
  </svg>
)
export const IconBranch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="18" r="2" />
    <circle cx="6" cy="6" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 8v8M18 10c0 4-6 3-10.5 6.5" />
  </svg>
)
export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 18l4-8 4 5 4-9 4 12" />
  </svg>
)
export const IconMessage = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 5h14v10H10l-5 4z" />
  </svg>
)
export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
)
export const IconHistory = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 5v4h4M12 8v4.5l3 2" />
  </svg>
)
export const IconUndo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
)
export const IconSwap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </svg>
)
export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </svg>
)
export const IconMove = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h16M16 8l4 4-4 4M8 8l-4 4 4 4" />
  </svg>
)
export const IconLock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
export const IconSend = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
)
export const IconMenu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
export const IconDocument = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 3.5h7l4 4V20.5H7z" />
    <path d="M14 3.5V8h4M10 12h5M10 15.5h5" />
  </svg>
)
