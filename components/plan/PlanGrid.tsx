"use client";

import { GRADES, TERMS } from "@/lib/solver/types";
import type { Grade, Term } from "@/lib/solver/types";
import type { CourseView } from "@/lib/plan/solve";
import { TermSlot } from "./TermSlot";
import { cn } from "@/components/ui/cn";

/**
 * The four-year board.
 *
 * Grades run across, terms down. Keeping all four years visible at once is the
 * whole point -- the consequence of moving a course is a year or two away, and
 * a view that showed one year at a time would hide exactly what the student
 * needs to see.
 */
export function PlanGrid({
  views,
  currentGrade,
  onRemove,
}: {
  views: readonly CourseView[];
  currentGrade: Grade;
  onRemove: (courseId: string) => void;
}) {
  const placed = views.filter((view) => view.placement !== null);
  const completed = views.filter((view) => view.completedGrade !== null);

  const at = (grade: Grade, term: Term): CourseView[] =>
    [
      // A completed full-year course is shown in term 1 -- its start -- just
      // like a planned full-year course. It remains locked by TermSlot.
      ...completed.filter(
        (view) => view.completedGrade === grade && term === 1,
      ),
      ...placed.filter(
        (view) => view.placement!.grade === grade && view.placement!.term === term,
      ),
    ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {GRADES.map((grade) => {
        const past = grade < currentGrade;
        const current = grade === currentGrade;

        return (
          <section
            key={grade}
            aria-label={`Grade ${grade}`}
            className={cn("flex flex-col gap-2", past && "opacity-60")}
          >
            <header className="flex items-baseline justify-between gap-2 px-0.5">
              <h3 className="text-title font-semibold">Grade {grade}</h3>
              {current && (
                <span className="text-meta font-medium text-muted">This year</span>
              )}
              {past && <span className="text-meta text-faint">Passed</span>}
            </header>

            {TERMS.map((term) => (
              <TermSlot
                key={term}
                grade={grade}
                term={term}
                views={at(grade, term)}
                locked={past}
                onRemove={onRemove}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
