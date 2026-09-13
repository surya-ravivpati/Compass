import Link from "next/link";
import { signUp } from "@/app/auth-actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; pending?: string }>;
}) {
  const params = await searchParams;

  // Sign-up can succeed without a session when the project requires email
  // confirmation. Saying so beats sending the student to a page that will
  // bounce them straight back here.
  if (params.pending !== undefined) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p>
          We sent you a confirmation link. Open it to finish setting up your
          account, then sign in.
        </p>
        <p className="text-sm">
          <Link href="/login" className="underline">Back to sign in</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create your Compass account</h1>

      {params.error !== undefined && (
        <p role="alert" className="border border-red-600 p-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <form action={signUp} className="flex flex-col gap-4">
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
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="password-hint"
            className="border p-2"
          />
          <p id="password-hint" className="text-sm text-gray-600">
            At least 8 characters.
          </p>
        </div>

        <button type="submit" className="border p-2 font-medium">
          Create account
        </button>
      </form>

      <p className="text-sm">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>.
      </p>
    </main>
  );
}
