import { afterEach, describe, expect, it, vi } from "vitest";
import { publicEnv, serverEnv } from "@/lib/env";
import { safeNextPath } from "@/validation/auth";

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refuses to run in a browser", () => {
    // The consequence of getting this wrong is not a crash -- it is the
    // service role key, which bypasses row-level security entirely, shipped
    // to every visitor. So it fails loudly rather than returning undefined.
    vi.stubGlobal("window", {});
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubEnv("DATABASE_URL", "postgres://localhost/x");

    expect(() => serverEnv()).toThrow(/called in the browser/i);
  });

  it("reads server configuration on the server", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    vi.stubEnv("DATABASE_URL", "postgres://localhost/x");
    expect(serverEnv().DATABASE_URL).toBe("postgres://localhost/x");
  });

  it("names the variable that is missing", () => {
    // A stack trace that says "undefined is not a string" sends someone
    // hunting through the code for a bug that is in their .env.local.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => serverEnv()).toThrow(/\.env\.local/);
  });
});

describe("publicEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a URL that is not one", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "key");
    expect(() => publicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("accepts a well-formed configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
  });
});

describe("safeNextPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeNextPath("/activities")).toBe("/activities");
    expect(safeNextPath("/settings?tab=courses")).toBe("/settings?tab=courses");
  });

  it("rejects an absolute URL", () => {
    // Otherwise a link to our own login page could land the student on
    // somebody else's site, with our domain in the address bar on the way.
    expect(safeNextPath("https://evil.example.com")).toBe("/plan");
    expect(safeNextPath("http://evil.example.com")).toBe("/plan");
  });

  it("rejects a protocol-relative URL", () => {
    // "//evil.example.com" starts with a slash but is not a local path.
    expect(safeNextPath("//evil.example.com")).toBe("/plan");
  });

  it("falls back when there is nothing to go back to", () => {
    expect(safeNextPath(null)).toBe("/plan");
    expect(safeNextPath(undefined)).toBe("/plan");
    expect(safeNextPath("")).toBe("/plan");
  });
});
