import { saveProfile } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Account setup.
 *
 * Collects the graduation year only. Choosing completed courses is the other
 * half of setup and needs the subject-grouped picker from Phase 3; it is not
 * stubbed here, because a half-built picker that looks finished is worse than
 * one that does not exist yet.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  const params = await searchParams;
  const thisYear = new Date().getFullYear();
  const options = [0, 1, 2, 3].map((offset) => thisYear + offset);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">When do you graduate?</h1>
      <p>Compass plans backward from your graduation year.</p>

      {params.error !== undefined && (
        <p role="alert" className="border border-red-600 p-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <form action={saveProfile} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="gradYear">Graduation year</label>
          <select id="gradYear" name="gradYear" required className="border p-2">
            {options.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="border p-2 font-medium">
          Continue
        </button>
      </form>
    </main>
  );
}
