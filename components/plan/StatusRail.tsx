"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/components/ui/cn";
import type { Tone } from "@/components/ui/Badge";
import type { Pathway, RequirementStatus } from "@/lib/solver/types";
import type { SolvedPlan } from "@/lib/plan/solve";

const REQUIREMENT_TONE: Record<RequirementStatus, Tone> = {
  met: "ok",
  on_track: "neutral",
  at_risk: "risk",
};

const REQUIREMENT_LABEL: Record<RequirementStatus, string> = {
  met: "Done",
  on_track: "On track",
  at_risk: "Short",
};

export function StatusRail({
  solved,
  pathways,
  goalPathwayId,
  onGoalChange,
}: {
  solved: SolvedPlan;
  pathways: readonly Pathway[];
  goalPathwayId: string | null;
  onGoalChange: (pathwayId: string | null) => void;
}) {
  const onTrack = solved.status === "on_track";

  const requiredOutstanding = solved.views
    .filter((view) => view.required && view.state !== "completed")
    .sort((a, b) => {
      // Soonest deadline first; things that no longer fit float to the top,
      // because those are the ones that need a decision.
      const left = a.latestStartGrade ?? 0;
      const right = b.latestStartGrade ?? 0;
      return left - right;
    });

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Goal</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <label htmlFor="goal-pathway" className="sr-only">
            Goal pathway
          </label>
          <select
            id="goal-pathway"
            value={goalPathwayId ?? ""}
            onChange={(event) =>
              onGoalChange(event.target.value === "" ? null : event.target.value)
            }
            className={cn(
              "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5",
              "text-body text-ink",
            )}
          >
            <option value="">No goal chosen</option>
            {pathways.map((pathway) => (
              <option key={pathway.id} value={pathway.id}>
                {pathway.name}
              </option>
            ))}
          </select>
          <p className="text-meta text-muted">
            {pathways.find((p) => p.id === goalPathwayId)?.description ??
              "Choose one and Compass works backward from it."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>Status</CardTitle>
          <Badge tone={onTrack ? "ok" : "risk"}>
            {onTrack ? "On track" : "At risk"}
          </Badge>
        </CardHeader>
        <CardBody>
          {solved.headlines.length === 0 ? (
            <p className="text-meta text-muted">
              Nothing is blocking you. Every requirement is covered by what you
              have done or planned.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {solved.headlines.map((headline) => (
                <li key={headline} className="flex gap-2 text-meta leading-snug">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-risk" />
                  <span className="text-ink">{headline}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Graduation requirements</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {solved.requirements.map((result) => (
            <div key={result.rule.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-meta font-medium">{result.rule.label}</span>
                <span className="tabular text-meta text-muted">
                  {result.rule.kind === "specific_course"
                    ? REQUIREMENT_LABEL[result.status]
                    : `${result.earned + result.planned} / ${result.required}`}
                </span>
              </div>
              <ProgressBar
                value={result.earned}
                planned={result.planned}
                max={result.required}
                tone={REQUIREMENT_TONE[result.status]}
                label={`${result.rule.label}: ${REQUIREMENT_LABEL[result.status]}`}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      {requiredOutstanding.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Required for this goal</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-1.5">
              {requiredOutstanding.map((view) => (
                <li
                  key={view.course.id}
                  className="flex items-baseline justify-between gap-2 text-meta"
                >
                  <span
                    className={cn(
                      view.state === "unreachable" ? "text-gone line-through" : "text-ink",
                    )}
                  >
                    {view.course.title}
                  </span>
                  <span className="shrink-0 text-faint">
                    {view.state === "unreachable"
                      ? "no room"
                      : view.placement !== null
                        ? `grade ${view.placement.grade}`
                        : view.latestStartGrade !== null
                          ? `by grade ${view.latestStartGrade}`
                          : "no room"}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
