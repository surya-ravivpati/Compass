import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'compass_session'
const PROTECTED = ['/home', '/plan', '/explore', '/requirements', '/what-if', '/assistant', '/settings', '/onboarding']

/**
 * Optimistic check only: no session cookie means no access, so redirect
 * before rendering. The real check -- the session verified against the
 * database -- happens in lib/auth/viewer on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (needsAuth && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
