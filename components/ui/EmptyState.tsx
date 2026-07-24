import Link from "next/link";
import { primaryButtonClass } from "@/components/form";

export function EmptyState({
  label,
  message,
  actionHref,
  actionLabel,
}: {
  label: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">{label}</div>
      <p className="max-w-sm text-sm text-text-2">{message}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className={primaryButtonClass}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
