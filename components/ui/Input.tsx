import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "./cn";

const FIELD =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-body " +
  "text-ink placeholder:text-faint transition-state disabled:opacity-50";

function Field({
  label,
  hint,
  error,
  htmlFor,
  hintId,
  children,
}: {
  label: string;
  // `| undefined` explicitly, because exactOptionalPropertyTypes distinguishes
  // "absent" from "present and undefined", and callers forward both.
  hint?: string | undefined;
  error?: string | undefined;
  htmlFor: string;
  hintId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-meta font-medium text-muted">
        {label}
      </label>
      {children}
      {/* Errors replace hints rather than stacking, so the field never grows
          taller as the student types and pushes the submit button away. */}
      {error !== undefined ? (
        <p id={hintId} role="alert" className="text-meta text-blocked">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={hintId} className="text-meta text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, ...rest }: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const described = hint !== undefined || error !== undefined;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} hintId={hintId}>
      <input
        id={id}
        aria-describedby={described ? hintId : undefined}
        aria-invalid={error !== undefined || undefined}
        className={cn(FIELD, error !== undefined && "border-blocked-line", className)}
        {...rest}
      />
    </Field>
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Select({ label, hint, error, className, children, ...rest }: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const described = hint !== undefined || error !== undefined;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} hintId={hintId}>
      <select
        id={id}
        aria-describedby={described ? hintId : undefined}
        className={cn(FIELD, error !== undefined && "border-blocked-line", className)}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
