"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/components/ui/cn";
import type { Grade, Term } from "@/lib/solver/types";
import type { CourseView } from "@/lib/plan/solve";
import { DraggableCourse } from "./DraggableCourse";

export function slotId(grade: Grade, term: Term): string {
  return `slot:${grade}:${term}`;
}

export function TermSlot({
  grade,
  term,
  views,
  locked,
  onRemove,
}: {
  grade: Grade;
  term: Term;
  views: readonly CourseView[];
  /** Terms the student has already lived through cannot take new courses. */
  locked: boolean;
  onRemove: (courseId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotId(grade, term),
    data: { grade, term },
    disabled: locked,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-24 flex-col gap-1.5 rounded-md border p-1.5 transition-state",
        locked
          ? "border-dashed border-line bg-transparent"
          : isOver
            ? "border-focus bg-hover"
            : "border-line bg-sunken",
      )}
    >
      <div className="px-1 text-meta font-medium text-faint">Term {term}</div>

      {views.map((view) => (
        <div key={view.course.id} className="group relative">
          <DraggableCourse view={view} />
          {!locked && (
            <button
              type="button"
              onClick={() => onRemove(view.course.id)}
              aria-label={`Remove ${view.course.title} from grade ${grade}, term ${term}`}
              className={cn(
                "absolute right-1 top-1 rounded-sm px-1 text-meta text-faint",
                "opacity-0 transition-state hover:bg-hover hover:text-ink",
                "group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {views.length === 0 && (
        <p className="px-1 py-2 text-meta text-faint">
          {locked ? "Already passed" : "Drop a course here"}
        </p>
      )}
    </div>
  );
}
