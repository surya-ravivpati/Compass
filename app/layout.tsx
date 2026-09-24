import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Compass — Your four years. Mapped.', template: '%s · Compass' },
  description:
    'Compass turns graduation requirements, prerequisites, and your goals into a personalized path through high school.',
}

export const viewport: Viewport = {
  themeColor: '#0b0d0f',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
