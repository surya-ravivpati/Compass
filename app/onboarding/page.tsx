import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireViewer } from '@/lib/auth/viewer'
import { currentAcademicYear } from '@/lib/calendar'
import { getDb } from '@/lib/db/client'
import { listSchools } from '@/lib/db/schools'
import { isAiConfigured } from '@/lib/ai/config'
import { OnboardingFlow } from '@/components/onboarding/flow'

export const metadata: Metadata = { title: 'Build your plan' }

export default async function OnboardingPage() {
  const viewer = await requireViewer()
  if (viewer.student.onboarded) redirect('/home')
  const db = await getDb()
  const schools = await listSchools(db)
  return <OnboardingFlow schools={schools} defaultAcademicYear={currentAcademicYear(new Date())} aiEnabled={isAiConfigured()} />
}
