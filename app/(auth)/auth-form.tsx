'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { AuthState } from './actions'

export function AuthForm({
  mode,
  action,
}: {
  mode: 'sign-in' | 'sign-up'
  action: (state: AuthState, form: FormData) => Promise<AuthState>
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const signUp = mode === 'sign-up'
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm text-mist">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="field"
          aria-invalid={!!state.error}
          aria-describedby={state.error ? 'auth-error' : undefined}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm text-mist">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={signUp ? 'new-password' : 'current-password'}
          required
          minLength={signUp ? 10 : undefined}
          className="field"
          aria-invalid={!!state.error}
          aria-describedby={signUp ? 'password-hint' : undefined}
        />
        {signUp ? (
          <p id="password-hint" className="text-xs text-fog">
            At least 10 characters.
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p id="auth-error" role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-10 w-full">
        {pending ? (signUp ? 'Creating your account…' : 'Signing in…') : signUp ? 'Create account' : 'Sign in'}
      </button>
      <p className="text-center text-sm text-mist">
        {signUp ? (
          <>
            Already have an account?{' '}
            <Link href="/sign-in" className="link">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Compass?{' '}
            <Link href="/sign-up" className="link">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
