import { requireStudent } from '@/lib/auth/viewer'
import { getDb } from '@/lib/db/client'
import { listSchools } from '@/lib/db/schools'
import { MobileNav, Sidebar } from '@/components/shell/nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStudent()
  const db = await getDb()
  const school = (await listSchools(db)).find((s) => s.id === viewer.student.schoolId)
  const name = viewer.student.firstName || viewer.email
  return (
    <div className="flex min-h-dvh">
      <Sidebar name={name} school={school?.name ?? ''} isDemo={school?.isDemo ?? false} />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <div className="pb-24 lg:pb-0">{children}</div>
      </div>
    </div>
  )
}
