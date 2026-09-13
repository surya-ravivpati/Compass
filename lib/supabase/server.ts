/**
 * Supabase client for server components, route handlers, and server actions.
 *
 * Uses the anon key plus the signed-in user's cookies, so every query runs as
 * that user and row-level security applies. This is the only path by which the
 * application touches student-owned rows.
 *
 * There is deliberately no service-role client here. The service role bypasses
 * RLS entirely, and the only thing that legitimately needs it is the seed
 * script, which builds its own connection in db/seed/run.ts.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes
            // the session on every request, so this is safe to ignore here.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Uses `getUser()` rather than `getSession()` deliberately: `getSession` reads
 * the cookie and trusts it, while `getUser` revalidates the token with the
 * auth server. On the server, where the answer decides what data someone sees,
 * the cookie is not something to take at its word.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null) return null;
  return data.user;
}
