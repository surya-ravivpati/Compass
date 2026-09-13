/**
 * Session refresh and route protection.
 *
 * Supabase access tokens are short-lived. Without a refresh on each request
 * the user is silently signed out mid-session, so this runs on every matched
 * route, rewrites the cookies, and then decides whether the request may
 * proceed.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { tryPublicEnv } from "@/lib/env";

/** Routes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/plan", "/activities", "/settings", "/welcome"];

/** Routes a signed-in user has no reason to see. */
const AUTH_PREFIXES = ["/login", "/signup"];

/** Any route whose behaviour depends on knowing who the visitor is. */
function needsAuth(pathname: string): boolean {
  return [...PROTECTED_PREFIXES, ...AUTH_PREFIXES].some((prefix) =>
    pathname.startsWith(prefix),
  );
}

const SETUP_REQUIRED = `<!doctype html>
<meta charset="utf-8">
<title>Compass needs configuring</title>
<main style="font:16px/1.6 system-ui;max-width:34rem;margin:15vh auto;padding:0 1.5rem">
  <h1 style="font-size:1.4rem">Supabase is not configured</h1>
  <p>This page needs to know who you are, and the auth layer has no
     credentials to work with. The public pages still work.</p>
  <ol>
    <li>Create a project at <code>supabase.com</code></li>
    <li><code>cp .env.example .env.local</code> and fill it in</li>
    <li><code>npm run db:migrate &amp;&amp; npm run db:seed</code></li>
    <li>Restart <code>npm run dev</code></li>
  </ol>
  <p><a href="/">Back to the home page</a></p>
</main>`;

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = tryPublicEnv();

  // Supabase is not configured on this machine. Public pages should still
  // render -- someone who has just cloned the repo ought to be able to look at
  // the site -- but anything that depends on knowing who the visitor is must
  // refuse rather than fall open. An unconfigured auth layer is the one
  // situation where "let them through" is the worst possible default.
  if (env === null) {
    if (needsAuth(pathname)) {
      return new NextResponse(SETUP_REQUIRED, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser(), not getSession(): this call revalidates the token with
  // the auth server rather than trusting whatever the cookie claims. It also
  // must not be skipped or reordered -- it is what refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && user === null) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed, so signing in does not dump them on a
    // generic landing page.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user !== null) {
    const url = request.nextUrl.clone();
    url.pathname = "/plan";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
