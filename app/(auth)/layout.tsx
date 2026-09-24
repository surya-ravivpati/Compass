import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-[1240px] px-5 py-5 md:px-8">
        <Link href="/" aria-label="Compass home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-10 md:pt-20">
        <div className="w-full max-w-[380px] animate-rise">{children}</div>
      </main>
    </div>
  )
}
