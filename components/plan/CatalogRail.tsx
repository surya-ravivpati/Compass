"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/components/ui/cn";
import { GRADES, TERMS } from "@/lib/solver/types";
import type { Grade, Term } from "@/lib/solver/types";
import type { CourseView } from "@/lib/plan/solve";
import { DraggableCourse } from "./DraggableCourse";
import { SUBJECT_LABELS, SUBJECT_ORDER } from "./CourseChip";

export const CATALOG_DROPPABLE_ID = "catalog";

/**
 * The course catalog, grouped by subject.
 *
 * Doubles as the drop target for taking a course back off the board, which is
 * why it is droppable: dragging a course out of the plan and into the list it
 * came from is the gesture people reach for.
 */
export function CatalogRail({
  views,
  currentGrade,
  onPlace,
}: {
  views: readonly CourseView[];
  currentGrade: Grade;
  onPlace: (courseId: string, grade: Grade, term: Term) => void;
}) {
  const [query, setQuery] = useState("");
  const [hideUnreachable, setHideUnreachable] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: CATALOG_DROPPABLE_ID });

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const candidates = views.filter((view) => {
      // Courses on the board live on the board, not in the list.
      if (view.placement !== null || view.state === "completed") return false;
      if (hideUnreachable && view.state === "unreachable") return false;
      if (needle === "") return true;
      return (
        view.course.title.toLowerCase().includes(needle) ||
        view.course.code.toLowerCase().includes(needle)
      );
    });

    return SUBJECT_ORDER.map((subject) => ({
      subject,
      label: SUBJECT_LABELS[subject] ?? subject,
      items: candidates.filter((view) => view.course.subject === subject),
    })).filter((group) => group.items.length > 0);
  }, [views, query, hideUnreachable]);

  const unreachableCount = views.filter(
    (v) => v.state === "unreachable" && v.placement === null,
  ).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full flex-col rounded-lg border transition-state",
        isOver ? "border-focus bg-hover" : "border-line bg-surface",
      )}
    >
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <label htmlFor="catalog-search" className="sr-only">
          Search courses
        </label>
        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search courses"
          className={cn(
            "h-8 w-full rounded-md border border-line-strong bg-canvas px-2.5",
            "text-body text-ink placeholder:text-faint",
          )}
        />
        {unreachableCount > 0 && (
          <label className="flex items-center gap-2 text-meta text-muted">
            <input
              type="checkbox"
              checked={hideUnreachable}
              onChange={(event) => setHideUnreachable(event.target.checked)}
              className="size-3.5 accent-current"
            />
            Hide {unreachableCount} out of reach
          </label>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-meta text-muted">
            {query.trim() === ""
              ? "Every course is either on your board or already done."
              : `Nothing matches "${query.trim()}".`}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.subject} className="flex flex-col gap-1.5">
                <h3 className="px-0.5 text-meta font-semibold uppercase tracking-wide text-faint">
                  {group.label}
                </h3>
                {group.items.map((view) => (
                  <div key={view.course.id} className="flex flex-col gap-1">
                    <DraggableCourse view={view} />
                    {/* A path to the board that does not require a mouse, and
                        does not require knowing dnd-kit's keyboard grammar. */}
                    <AddControl
                      view={view}
                      currentGrade={currentGrade}
                      onPlace={onPlace}
                    />
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddControl({
  view,
  currentGrade,
  onPlace,
}: {
  view: CourseView;
  currentGrade: Grade;
  onPlace: (courseId: string, grade: Grade, term: Term) => void;
}) {
  const slots: Array<{ grade: Grade; term: Term }> = [];
  for (const grade of GRADES) {
    if (grade < currentGrade) continue;
    for (const term of TERMS) {
      // A full-year course started in the spring would run past June.
      if (view.course.durationTerms === 2 && term !== 1) continue;
      if (!view.course.termsOffered.includes(term)) continue;
      slots.push({ grade, term });
    }
  }

  if (slots.length === 0) return null;

  return (
    <label className="flex items-center gap-1.5 px-0.5 text-meta text-faint">
      <span className="sr-only">Add {view.course.title} to</span>
      <select
        value=""
        onChange={(event) => {
          const [grade, term] = event.target.value.split(":").map(Number);
          if (grade !== undefined && term !== undefined) {
            onPlace(view.course.id, grade as Grade, term as Term);
          }
        }}
        className={cn(
          "h-6 w-full rounded-sm border border-line bg-canvas px-1",
          "text-meta text-muted",
        )}
      >
        <option value="" disabled>
          Add to&hellip;
        </option>
        {slots.map(({ grade, term }) => (
          <option key={`${grade}:${term}`} value={`${grade}:${term}`}>
            Grade {grade}, term {term}
          </option>
        ))}
      </select>
    </label>
  );
}
