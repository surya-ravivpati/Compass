'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { authenticate, createAccount } from '@/lib/data/accounts'
import { getStudentByUser } from '@/lib/data/students'
import { allowAttempt, clearAttempts } from '@/lib/auth/rate-limit'
import { endSession, startSession } from '@/lib/auth/viewer'

export interface AuthState {
  error?: string
  email?: string
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '')
  const password = String(form.get('password') ?? '')
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!allowAttempt(`signup:${ip}`, 20)) return { error: 'Too many attempts. Wait a few minutes and try again.', email }
  const db = await getDb()
  const result = await createAccount(db, email, password)
  if (!result.ok) return { error: result.error, email }
  await startSession(result.userId)
  redirect('/onboarding')
}

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!allowAttempt(`signin:${email}`) || !allowAttempt(`signin-ip:${ip}`, 30)) {
    return { error: 'Too many attempts. Wait a few minutes and try again.', email }
  }
  const db = await getDb()
  const userId = await authenticate(db, email, password)
  if (!userId) return { error: 'That email and password don’t match an account.', email }
  clearAttempts(`signin:${email}`)
  await startSession(userId)
  const student = await getStudentByUser(db, userId)
  redirect(student?.onboarded ? '/home' : '/onboarding')
}

export async function signOutAction(): Promise<void> {
  await endSession()
  redirect('/')
}
