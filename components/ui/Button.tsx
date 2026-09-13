import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * `primary` is near-black rather than a brand colour, so that green, amber and
 * red stay reserved for meaning. `danger` is the exception, and is only for
 * actions that destroy something.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink border border-transparent hover:opacity-90 disabled:opacity-40",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-hover disabled:opacity-40",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-hover hover:text-ink disabled:opacity-40",
  danger:
    "bg-transparent text-blocked border border-blocked-line hover:bg-blocked-bg disabled:opacity-40",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-meta gap-1.5",
  md: "h-9 px-3.5 text-body gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-state disabled:cursor-not-allowed select-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
