import Link from "next/link";
import { primaryButtonClass } from "@/components/form";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">404</div>
      <p className="max-w-sm text-sm text-text-2">
        This page doesn&apos;t exist, or the item you&apos;re looking for was removed.
      </p>
      <Link href="/dashboard" className={primaryButtonClass}>
        Back to Dashboard
      </Link>
    </div>
  );
}
