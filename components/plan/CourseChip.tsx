import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import type { CourseState, CourseView } from "@/lib/plan/solve";

/**
 * One course, drawn according to its state.
 *
 * Colour here is doing real work, so each state also carries a word: a
 * student who cannot distinguish the red border from the grey one still reads
 * "Blocked" and "No room left".
 */
const STATE_STYLES: Record<CourseState, string> = {
  available: "border-line bg-surface text-ink",
  placed: "border-line-strong bg-surface text-ink",
  completed: "border-line bg-sunken text-muted",
  violation: "border-blocked-line bg-blocked-bg text-ink",
  unreachable: "border-gone-line bg-gone-bg text-gone",
};

const STATE_LABEL: Partial<Record<CourseState, { text: string; tone: "blocked" | "gone" | "ok" }>> = {
  violation: { text: "Blocked", tone: "blocked" },
  unreachable: { text: "No room left", tone: "gone" },
  completed: { text: "Done", tone: "ok" },
};

export function CourseChip({
  view,
  showSubject = false,
  dragging = false,
  className,
}: {
  view: CourseView;
  showSubject?: boolean;
  dragging?: boolean;
  className?: string;
}) {
  const { course, state } = view;
  const label = STATE_LABEL[state];

  return (
    <div
      className={cn(
        "w-full rounded-md border px-2.5 py-2 text-left transition-state",
        STATE_STYLES[state],
        dragging && "opacity-50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-body font-medium leading-snug",
            state === "unreachable" && "line-through decoration-1",
          )}
        >
          {course.title}
        </span>
        {course.level === "ap" && (
          <span className="mt-0.5 shrink-0 text-meta font-semibold text-faint">AP</span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
        {showSubject && <span>{SUBJECT_LABELS[course.subject]}</span>}
        <span className="tabular">
          {course.durationTerms === 2 ? "Full year" : "One term"}
        </span>
        {view.required && state !== "completed" && (
          <Badge tone="neutral">Required</Badge>
        )}
        {label !== undefined && <Badge tone={label.tone}>{label.text}</Badge>}
        {state === "available" && view.required && view.latestStartGrade !== null && (
          <span className="text-faint">by grade {view.latestStartGrade}</span>
        )}
      </div>
    </div>
  );
}

export const SUBJECT_LABELS: Record<string, string> = {
  math: "Mathematics",
  science: "Science",
  english: "English",
  social_studies: "Social Studies",
  world_language: "World Language",
  computer_science: "Computer Science",
  arts: "Arts",
  pe_health: "PE and Health",
  elective: "Electives",
};

export const SUBJECT_ORDER = [
  "english", "math", "science", "social_studies", "world_language",
  "computer_science", "arts", "pe_health", "elective",
] as const;
