import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * What the middleware does when Supabase is not configured.
 *
 * The tempting shortcut is to skip auth entirely when there are no
 * credentials, so the app "just works" on a fresh clone. That would mean the
 * protected pages open to anyone the moment an environment variable goes
 * missing in production -- a config mistake turning into a data leak. So
 * unconfigured fails closed on anything that depends on identity, and open
 * only on pages that never did.
 */

const request = (path: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"));

function clearSupabaseEnv() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
}

describe("when Supabase is not configured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/plan", "/activities", "/settings", "/welcome"])(
    "refuses %s rather than letting anyone in",
    async (path) => {
      clearSupabaseEnv();
      const response = await updateSession(request(path));
      expect(response.status).toBe(503);
    },
  );

  it.each(["/login", "/signup"])("refuses %s, which cannot work anyway", async (path) => {
    clearSupabaseEnv();
    const response = await updateSession(request(path));
    expect(response.status).toBe(503);
  });

  it.each(["/", "/how-it-works"])("still serves %s", async (path) => {
    // A fresh clone should be able to run `npm run dev` and look at the site.
    clearSupabaseEnv();
    const response = await updateSession(request(path));
    expect(response.status).toBe(200);
  });

  it("explains what to do instead of failing blankly", async () => {
    clearSupabaseEnv();
    const response = await updateSession(request("/plan"));
    const body = await response.text();
    expect(body).toContain("Supabase is not configured");
    expect(body).toContain(".env.local");
  });
});
