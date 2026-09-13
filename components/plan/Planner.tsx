"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { buildCatalog, buildGraph } from "@/lib/solver/graph";
import type { CourseGraph } from "@/lib/solver/graph";
import type {
  Course,
  Grade,
  Pathway,
  Placement,
  Plan,
  RequirementRule,
  Term,
} from "@/lib/solver/types";
import { solvePlan } from "@/lib/plan/solve";
import { placeCourse, removeCourse, setGoalPathway } from "@/app/plan-actions";
import type { ActionResult } from "@/app/plan-actions";
import { CourseChip } from "./CourseChip";
import { CatalogRail, CATALOG_DROPPABLE_ID } from "./CatalogRail";
import { PlanGrid } from "./PlanGrid";
import { StatusRail } from "./StatusRail";

/**
 * The planner.
 *
 * The solver runs here, in the browser, on every change. It is pure TypeScript
 * with no dependencies and the catalog is under a hundred courses, so a full
 * re-solve after each drag costs less than working out what changed -- and
 * "what changed" is exactly the kind of incremental bookkeeping that goes
 * subtly wrong.
 *
 * Changes apply optimistically and are saved in the background. When a save
 * fails the change is rolled back and the reason is shown: a board that
 * quietly disagrees with the database is worse than one that admits it could
 * not save.
 */
export function Planner({
  courses,
  pathways,
  requirements,
  initialPlan,
  initialGoalPathwayId,
}: {
  /**
   * Plain course data rather than a built graph: a CourseGraph carries
   * functions, and only serializable values cross from a server component to
   * a client one. Building it here costs a few milliseconds once.
   */
  courses: readonly Course[];
  pathways: readonly Pathway[];
  requirements: readonly RequirementRule[];
  initialPlan: Plan;
  initialGoalPathwayId: string | null;
}) {
  const graph = useMemo(() => buildGraph(buildCatalog(courses)), [courses]);

  const [placements, setPlacements] = useState<readonly Placement[]>(
    initialPlan.placements,
  );
  const [goalPathwayId, setGoalId] = useState<string | null>(initialGoalPathwayId);
  const [draggingCourseId, setDraggingCourseId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const plan: Plan = useMemo(
    () => ({ ...initialPlan, placements }),
    [initialPlan, placements],
  );

  const goalCourseIds = useMemo(
    () => pathways.find((p) => p.id === goalPathwayId)?.goalCourseIds ?? [],
    [pathways, goalPathwayId],
  );

  // The live update. Everything the UI draws comes from here.
  const solved = useMemo(
    () => solvePlan(plan, graph, requirements, goalCourseIds),
    [plan, graph, requirements, goalCourseIds],
  );

  const sensors = useSensors(
    // A small distance threshold so a click to read a tooltip is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const place = useCallback(
    async (courseId: string, grade: Grade, term: Term) => {
      const course = graph.catalog.byId.get(courseId);
      if (course === undefined) return;

      // Structurally impossible placements are refused rather than accepted
      // and flagged. A prerequisite violation is a real state a student can
      // work through; a full-year course starting in the spring is not a
      // state at all.
      if (course.durationTerms === 2 && term !== 1) {
        setProblem(`${course.title} runs the whole year, so it has to start in term 1.`);
        return;
      }
      if (!course.termsOffered.includes(term)) {
        setProblem(
          `${course.title} is not offered in term ${term}.`,
        );
        return;
      }
      if (grade < plan.currentGrade) {
        setProblem(`Grade ${grade} has already passed.`);
        return;
      }

      setProblem(null);
      const previous = placements;
      setPlacements((current) => [
        ...current.filter((p) => p.courseId !== courseId),
        { courseId, grade, term },
      ]);

      const result = await save(() => placeCourse({ courseId, grade, term }));
      if (!result.ok) {
        setPlacements(previous);
        setProblem(result.error);
      }
    },
    [graph, placements, plan.currentGrade],
  );

  const remove = useCallback(
    async (courseId: string) => {
      setProblem(null);
      const previous = placements;
      setPlacements((current) => current.filter((p) => p.courseId !== courseId));

      const result = await save(() => removeCourse(courseId));
      if (!result.ok) {
        setPlacements(previous);
        setProblem(result.error);
      }
    },
    [placements],
  );

  const changeGoal = useCallback(
    async (pathwayId: string | null) => {
      const previous = goalPathwayId;
      setGoalId(pathwayId);
      const result = await save(() => setGoalPathway(pathwayId));
      if (!result.ok) {
        setGoalId(previous);
        setProblem(result.error);
      }
    },
    [goalPathwayId],
  );

  const onDragStart = (event: DragStartEvent) => {
    setDraggingCourseId(String(event.active.data.current?.courseId ?? ""));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingCourseId(null);
    const courseId = event.active.data.current?.courseId;
    if (typeof courseId !== "string") return;

    const over = event.over;
    if (over === null) return;

    if (over.id === CATALOG_DROPPABLE_ID) {
      void remove(courseId);
      return;
    }

    const data = over.data.current;
    if (data === undefined) return;
    void place(courseId, data.grade as Grade, data.term as Term);
  };

  const dragging =
    draggingCourseId === null ? null : solved.byCourseId.get(draggingCourseId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingCourseId(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${courseTitle(graph, active.data.current?.courseId)}.`,
          onDragOver: ({ active, over }) =>
            over === null
              ? `${courseTitle(graph, active.data.current?.courseId)} is not over a slot.`
              : `${courseTitle(graph, active.data.current?.courseId)} is over ${describeTarget(over.id)}.`,
          onDragEnd: ({ active, over }) =>
            over === null
              ? `${courseTitle(graph, active.data.current?.courseId)} was returned.`
              : `${courseTitle(graph, active.data.current?.courseId)} was dropped on ${describeTarget(over.id)}.`,
          onDragCancel: ({ active }) =>
            `Dropping ${courseTitle(graph, active.data.current?.courseId)} was cancelled.`,
        },
      }}
    >
      {problem !== null && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-risk-line bg-risk-bg px-3 py-2 text-meta text-ink"
        >
          {problem}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <aside className="order-2 h-[32rem] lg:order-1 lg:h-[calc(100vh-9rem)] lg:sticky lg:top-4">
          <CatalogRail
            views={solved.views}
            currentGrade={plan.currentGrade}
            onPlace={(courseId, grade, term) => void place(courseId, grade, term)}
          />
        </aside>

        <main className="order-1 min-w-0 lg:order-2">
          <PlanGrid
            views={solved.views}
            currentGrade={plan.currentGrade}
            onRemove={(courseId) => void remove(courseId)}
          />
        </main>

        <aside className="order-3">
          <StatusRail
            solved={solved}
            pathways={pathways}
            goalPathwayId={goalPathwayId}
            onGoalChange={(id) => void changeGoal(id)}
          />
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging !== null && (
          <div className="w-56 cursor-grabbing">
            <CourseChip view={dragging} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Run a save, turning any thrown error into a result.
 *
 * A server action can reject outright -- the network drops, the session is
 * gone, the server errors -- and an unhandled rejection would leave the board
 * showing a change that was never stored. Every failure has to come back as
 * something the caller can roll back and report.
 */
async function save(action: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await action();
  } catch {
    return { ok: false, error: "Could not reach the server. Your change was not saved." };
  }
}

function courseTitle(graph: CourseGraph, courseId: unknown): string {
  if (typeof courseId !== "string") return "the course";
  return graph.catalog.byId.get(courseId)?.title ?? "the course";
}

function describeTarget(id: string | number): string {
  const text = String(id);
  if (text === CATALOG_DROPPABLE_ID) return "the course list";
  const [, grade, term] = text.split(":");
  return `grade ${grade}, term ${term}`;
}
