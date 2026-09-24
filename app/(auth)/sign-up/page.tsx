import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth/viewer'
import { signUpAction } from '../actions'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Create your account' }

export default async function SignUpPage() {
  if (await getViewer()) redirect('/home')
  return (
    <>
      <h1 className="text-2xl font-semibold">Build your plan</h1>
      <p className="mt-2 mb-8 text-mist">Create an account to save your four-year plan. Only you can see it.</p>
      <AuthForm mode="sign-up" action={signUpAction} />
    </>
  )
}
