/**
 * Loading state.
 *
 * Deliberately the shape of the planner rather than a spinner: the layout does
 * not jump when the real thing arrives, and the student can see what is coming.
 */
export default function LoadingPlan() {
  return (
    <div className="mx-auto min-h-screen max-w-[100rem] px-4 py-4">
      <div className="mb-4 h-8 border-b border-line" />
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <div className="h-[32rem] animate-pulse rounded-lg border border-line bg-surface" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[9, 10, 11, 12].map((grade) => (
            <div key={grade} className="flex flex-col gap-2">
              <div className="h-5 w-20 animate-pulse rounded bg-sunken" />
              <div className="h-24 animate-pulse rounded-md border border-line bg-sunken" />
              <div className="h-24 animate-pulse rounded-md border border-line bg-sunken" />
            </div>
          ))}
        </div>
        <div className="hidden h-96 animate-pulse rounded-lg border border-line bg-surface xl:block" />
      </div>
      <span className="sr-only" role="status">
        Loading your plan
      </span>
    </div>
  );
}
