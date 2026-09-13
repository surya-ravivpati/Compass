"use client";

import { Button } from "@/components/ui/Button";

/**
 * Error state.
 *
 * Shows the actual message. The failures that reach here are things like an
 * unseeded catalog or a malformed prerequisite expression, and those messages
 * say exactly what to run -- hiding them behind "Something went wrong" would
 * throw away the only useful part.
 */
export default function PlanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-display font-semibold tracking-tight">
        Your plan could not be loaded
      </h1>
      <p className="rounded-md border border-blocked-line bg-blocked-bg px-3 py-2 text-meta text-ink">
        {error.message}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
