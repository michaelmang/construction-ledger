"use client";

import Link from "next/link";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <div className="text-[11px] font-medium uppercase tracking-widest text-negative">
        Something Went Wrong
      </div>
      <p className="max-w-sm text-sm text-text-2">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className={primaryButtonClass}>
          Try Again
        </button>
        <Link href="/dashboard" className={secondaryButtonClass}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
