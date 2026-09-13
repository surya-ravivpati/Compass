"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Built on the native <dialog> element.
 *
 * That choice buys focus trapping, Escape-to-close, inert background content,
 * and correct screen-reader semantics from the platform, all of which are easy
 * to get subtly wrong by hand and none of which need a dependency.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop closes; clicking the panel does not, because the
      // backdrop is the <dialog> itself and the panel is its child.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line",
        "bg-surface p-0 text-ink backdrop:bg-black/40",
      )}
    >
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <h2 className="text-title font-semibold">{title}</h2>
        {description !== undefined && (
          <p className="text-meta text-muted">{description}</p>
        )}
      </div>
      {children !== undefined && <div className="px-4 py-3">{children}</div>}
      {footer !== undefined && (
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
