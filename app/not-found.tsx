import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[620px] flex-col justify-center px-5 md:px-8">
      <Logo />
      <p className="eyebrow mt-10">Not found</p>
      <h1 className="mt-2 text-[28px] font-semibold">There’s no page here.</h1>
      <p className="mt-3 text-mist">The link may be old, or the course may not be in your school’s catalog.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/home" className="btn btn-primary">
          Go to your overview
        </Link>
        <Link href="/explore" className="btn btn-ghost">
          Explore courses
        </Link>
      </div>
    </main>
  )
}
