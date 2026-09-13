import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn("border-b border-line px-4 py-3", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-title font-semibold text-ink", className)}>{children}</h2>
  );
}

export function CardBody({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn("px-4 py-3", className)} {...rest}>
      {children}
    </div>
  );
}
