import { cn } from "./cn";
import type { Tone } from "./Badge";

const FILL: Record<Tone, string> = {
  neutral: "bg-muted",
  ok: "bg-ok",
  risk: "bg-risk",
  blocked: "bg-blocked",
  gone: "bg-gone",
};

/**
 * A progress bar that can show two quantities at once: what is banked, and
 * what is merely planned.
 *
 * The distinction is the point. A requirement met by courses a student has
 * only pencilled in is not the same as one they have finished, and a single
 * solid bar would say it was.
 */
export function ProgressBar({
  value,
  planned = 0,
  max,
  tone = "neutral",
  label,
}: {
  value: number;
  planned?: number;
  max: number;
  tone?: Tone;
  label: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const done = Math.min(value / safeMax, 1);
  const withPlanned = Math.min((value + planned) / safeMax, 1);

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-sunken"
    >
      {/* Planned sits behind, at reduced opacity: visibly present, visibly
          not yet real. */}
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full opacity-30 transition-state", FILL[tone])}
        style={{ width: `${withPlanned * 100}%` }}
      />
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full transition-state", FILL[tone])}
        style={{ width: `${done * 100}%` }}
      />
    </div>
  );
}
