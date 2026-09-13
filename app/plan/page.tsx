import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadCatalog } from "@/lib/catalog/load";
import { loadPlan } from "@/lib/plan/load";
import { Planner } from "@/components/plan/Planner";
import { AppHeader } from "@/components/plan/AppHeader";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const user = await getCurrentUser();
  if (user === null) redirect("/login");

  const loaded = await loadPlan(user.id);
  // No profile yet means setup was never finished.
  if (loaded === null) redirect("/welcome");

  const catalog = await loadCatalog();

  return (
    <div className="mx-auto min-h-screen max-w-[100rem] px-4 py-4">
      <AppHeader email={user.email ?? ""} gradYear={loaded.profile.gradYear} />

      {loaded.plan.placements.length === 0 && (
        <p className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-meta text-muted">
          Drag a course from the list onto a term, or use its
          &ldquo;Add to&hellip;&rdquo; menu. Pick a goal on the right and
          Compass will work backward from it.
        </p>
      )}

      <Planner
        courses={catalog.courses}
        pathways={catalog.pathways}
        requirements={catalog.requirements}
        initialPlan={loaded.plan}
        initialGoalPathwayId={loaded.profile.goalPathwayId}
      />
    </div>
  );
}
