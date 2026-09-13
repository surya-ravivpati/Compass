"use client";

import { useDraggable } from "@dnd-kit/core";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/components/ui/cn";
import { CourseChip } from "./CourseChip";
import type { CourseView } from "@/lib/plan/solve";

/**
 * A course the student can pick up.
 *
 * It is a <button>, not a styled <div>, so it is reachable by Tab and dnd-kit's
 * keyboard sensor can take it from there: space to lift, arrows to move, space
 * to drop. Completed courses are locked -- they already happened, and letting
 * someone drag one would imply the plan could change the past.
 */
export function DraggableCourse({
  view,
  showSubject = false,
}: {
  view: CourseView;
  showSubject?: boolean;
}) {
  const locked = view.state === "completed";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `course:${view.course.id}`,
    data: { courseId: view.course.id },
    disabled: locked,
  });

  const chip = (extra: Record<string, unknown> = {}) => (
    <button
      ref={setNodeRef}
      type="button"
      disabled={locked}
      className={cn(
        "block w-full rounded-md text-left",
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
      {...extra}
    >
      <CourseChip view={view} showSubject={showSubject} dragging={isDragging} />
    </button>
  );

  // The explanation is the product. Anything blocked or out of reach carries
  // its reason on hover and on focus.
  if (view.reason !== null) {
    return <Tooltip content={view.reason}>{(props) => chip(props)}</Tooltip>;
  }

  return chip();
}
