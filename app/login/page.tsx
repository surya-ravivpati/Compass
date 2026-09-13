import Link from "next/link";
import { signIn } from "@/app/auth-actions";
import { safeNextPath } from "@/validation/auth";

/**
 * Sign in.
 *
 * Deliberately plain: Phase 2 is about authentication working and being
 * secure. The design system arrives in Phase 3, and this page is restyled
 * with it rather than being decorated now and redone later.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Compass</h1>

      {params.error !== undefined && (
        <p role="alert" className="border border-red-600 p-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <form action={signIn} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="border p-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            className="border p-2"
          />
        </div>

        <button type="submit" className="border p-2 font-medium">
          Sign in
        </button>
      </form>

      <p className="text-sm">
        No account yet? <Link href="/signup" className="underline">Create one</Link>.
      </p>
    </main>
  );
}
