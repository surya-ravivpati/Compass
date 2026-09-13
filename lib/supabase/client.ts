"use client";

/**
 * Supabase client for the browser.
 *
 * Carries only the anon key, which is public by design -- it grants nothing on
 * its own. What a request may actually do is decided by the user's access
 * token and the row-level security policies in db/migrations/0001_rls.sql.
 */

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function createClient() {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
