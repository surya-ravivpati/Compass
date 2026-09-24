'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import { useState } from 'react'
import { signOutAction } from '@/app/(auth)/actions'
import {
  IconBranch,
  IconCompassRose,
  IconHome,
  IconLayers,
  IconMap,
  IconMenu,
  IconMessage,
  IconSettings,
  IconX,
} from '@/components/ui/icons'
import { Logo } from '@/components/ui/logo'

export const NAV: { href: Route; label: string; short: string; icon: typeof IconHome }[] = [
  { href: '/home', label: 'Home', short: 'Home', icon: IconHome },
  { href: '/plan', label: 'My Plan', short: 'Plan', icon: IconMap },
  { href: '/explore', label: 'Explore', short: 'Explore', icon: IconCompassRose },
  { href: '/requirements', label: 'Requirements', short: 'Reqs', icon: IconLayers },
  { href: '/what-if', label: 'What If?', short: 'What If', icon: IconBranch },
  { href: '/assistant', label: 'Compass AI', short: 'AI', icon: IconMessage },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: IconSettings },
]

const MOBILE_TABS = ['/home', '/plan', '/explore', '/requirements', '/assistant']

export function Sidebar({ name, school, isDemo }: { name: string; school: string; isDemo: boolean }) {
  const pathname = usePathname()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
      <Link href="/home" className="px-2.5" aria-label="Compass home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="mt-8 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] transition-colors ${
                active ? 'bg-white/[0.06] text-ink' : 'text-mist hover:bg-white/[0.03] hover:text-ink'
              }`}
            >
              <Icon className={active ? 'text-signal' : ''} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto border-t border-line px-2.5 pt-4">
        <p className="truncate text-sm">{name}</p>
        <p className="mt-0.5 truncate text-xs text-fog">
          {school}
          {isDemo ? ' · demo' : ''}
        </p>
        <form action={signOutAction} className="mt-3">
          <button type="submit" className="text-xs text-fog hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-carbon/85 px-4 backdrop-blur lg:hidden">
        <Link href="/home" aria-label="Compass home">
          <Logo size={20} />
        </Link>
        <button type="button" className="btn btn-quiet btn-sm" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
          {open ? <IconX /> : <IconMenu />}
          <span className="sr-only">Menu</span>
        </button>
      </header>
      {open ? (
        <nav id="mobile-menu" aria-label="All pages" className="fixed inset-x-0 top-14 z-30 border-b border-line bg-obsidian p-3 lg:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] text-mist hover:bg-white/5 hover:text-ink">
              <item.icon /> {item.label}
            </Link>
          ))}
          <form action={signOutAction} className="border-t border-line px-3 pt-3">
            <button type="submit" className="text-sm text-fog">
              Sign out
            </button>
          </form>
        </nav>
      ) : null}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-carbon/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.filter((n) => MOBILE_TABS.includes(n.href)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'text-ink' : 'text-fog'}`}>
              <item.icon size={18} className={active ? 'text-signal' : ''} />
              {item.short}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
