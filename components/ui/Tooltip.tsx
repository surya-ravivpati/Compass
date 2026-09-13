"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Explanation on hover *and* on focus.
 *
 * Hover alone would put the most important thing this product says -- why a
 * course is out of reach -- out of reach of anyone using a keyboard. The
 * content is also wired up with aria-describedby so a screen reader announces
 * it as part of the control, rather than as loose text that appears from
 * nowhere.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: (props: {
    "aria-describedby": string | undefined;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative block">
      {children({
        "aria-describedby": open ? id : undefined,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      })}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-0 top-full z-50 mt-1.5 block",
            "w-64 rounded-md border border-line-strong bg-surface px-2.5 py-2",
            "text-meta leading-snug text-ink shadow-sm",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
