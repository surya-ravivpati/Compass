import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/viewer'
import { signInAction } from '../actions'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage() {
  if (await getViewer()) redirect('/home')
  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 mb-8 text-mist">Sign in to pick up your path where you left it.</p>
      <AuthForm mode="sign-in" action={signInAction} />
    </>
  )
}
