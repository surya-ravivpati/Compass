/**
 * Environment variables, validated.
 *
 * Split deliberately into two halves, because the consequence of confusing
 * them is not a crash -- it is a secret shipped to every visitor's browser.
 *
 *   `publicEnv()`  NEXT_PUBLIC_* only. Next inlines these into the client
 *                  bundle. Anything here is public, permanently.
 *   `serverEnv()`  secrets. Throws if it is ever reached from a browser
 *                  bundle, so a bad import fails loudly at the first request
 *                  instead of quietly leaking.
 *
 * Both are functions rather than module constants so that a missing variable
 * fails where it is used, with a message naming it, rather than crashing the
 * build of pages that never needed it.
 */

import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Read as literal property accesses, never `process.env[name]`. Next only
 * substitutes NEXT_PUBLIC_* values into the bundle when it can see the full
 * literal at build time; a dynamic lookup silently yields undefined in the
 * browser.
 */
export function publicEnv(): PublicEnv {
  return parseOrExplain(publicSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Public configuration, or null when it is absent.
 *
 * Exists so the middleware can tell "Supabase is not set up on this machine"
 * apart from a genuine failure, and let the public pages render anyway. A
 * fresh clone should be able to run `npm run dev` and look at the site without
 * first creating a Supabase project.
 *
 * It returns null rather than a set of blank defaults on purpose: a caller has
 * to decide what to do about it, and cannot accidentally proceed with an empty
 * URL as though everything were fine.
 */
export function tryPublicEnv(): PublicEnv | null {
  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return result.success ? result.data : null;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Something imported server-only " +
        "configuration into a client component. The service role key must never " +
        "reach the client bundle.",
    );
  }
  return parseOrExplain(serverSchema, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  });
}

function parseOrExplain<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const missing = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n  ");

  throw new Error(
    `Environment is not configured.\n  ${missing}\n\n` +
      `Copy .env.example to .env.local and fill in the values from your ` +
      `Supabase project settings.`,
  );
}
