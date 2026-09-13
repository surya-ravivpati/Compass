import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tones map one-to-one onto the product's four states. There is deliberately
 * no "info" or "primary" tone: a badge that means nothing in particular
 * teaches students to ignore the ones that do.
 */
export type Tone = "neutral" | "ok" | "risk" | "blocked" | "gone";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-muted border-line",
  ok: "bg-ok-bg text-ok border-ok-line",
  risk: "bg-risk-bg text-risk border-risk-line",
  blocked: "bg-blocked-bg text-blocked border-blocked-line",
  gone: "bg-gone-bg text-gone border-gone-line",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5",
        "text-meta font-medium whitespace-nowrap transition-state",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
