import Link from "next/link";
import { signOut } from "@/app/auth-actions";

export function AppHeader({ email, gradYear }: { email: string; gradYear: number }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <div className="flex items-baseline gap-3">
        <Link href="/plan" className="text-title font-semibold tracking-tight">
          Compass
        </Link>
        <span className="tabular text-meta text-muted">Class of {gradYear}</span>
      </div>
      <div className="flex items-center gap-3 text-meta text-muted">
        <span className="hidden sm:inline">{email}</span>
        <form action={signOut}>
          <button type="submit" className="rounded-sm underline hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
