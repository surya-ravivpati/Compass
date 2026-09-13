import { redirect } from "next/navigation";
import { signOut } from "@/app/auth-actions";
import { getCurrentUser, createClient } from "@/lib/supabase/server";

/**
 * The planner.
 *
 * Phase 3 builds this properly: the four-year grid, the catalog rail,
 * drag-and-drop, and live solver feedback. For now it exists to prove the
 * protected route works end to end -- a signed-out visitor never reaches it,
 * and a signed-in one sees their own profile row and nobody else's.
 *
 * It shows only what it can actually show. Nothing here is a mock-up of the
 * planner to come.
 */
export default async function PlanPage() {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("student_profiles")
    .select("grad_year, goal_pathway_id, weekly_hour_cap")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile === null) redirect("/welcome");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your plan</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </header>

      <dl className="flex flex-col gap-2">
        <div className="flex gap-2">
          <dt className="font-medium">Signed in as</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Graduating</dt>
          <dd>{profile.grad_year}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Weekly activity cap</dt>
          <dd>{profile.weekly_hour_cap} hours</dd>
        </div>
      </dl>

      <p className="border-t pt-6 text-sm text-gray-600">
        {/* TODO(phase-3): replace with the planning grid, catalog rail, and
            live solver feedback. */}
        The planning grid arrives in Phase 3. The solver behind it is built and
        tested; this page is not wired to it yet.
      </p>
    </main>
  );
}
