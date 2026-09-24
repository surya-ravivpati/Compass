import 'server-only'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { getDb } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { getStudentByUser, type StudentProfile } from '../data/students.ts'
import { issueSession, resolveSession, revokeSession, SESSION_COOKIE } from './sessions.ts'

export interface Viewer {
  userId: string
  email: string
  student: StudentProfile
}

/** The signed-in user for this request, verified against the database. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const db = await getDb()
  const userId = await resolveSession(db, token)
  if (!userId) return null
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
  const student = await getStudentByUser(db, userId)
  if (!user || !student) return null
  return { userId, email: user.email, student }
})

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect('/sign-in')
  return viewer
}

/** A signed-in student who has finished onboarding. */
export async function requireStudent(): Promise<Viewer> {
  const viewer = await requireViewer()
  if (!viewer.student.onboarded) redirect('/onboarding')
  return viewer
}

/** Sets the session cookie. Only callable from Server Actions and Route Handlers. */
export async function startSession(userId: string): Promise<void> {
  const db = await getDb()
  const { token, expiresAt } = await issueSession(db, userId)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  const db = await getDb()
  await revokeSession(db, token)
  store.delete(SESSION_COOKIE)
}
