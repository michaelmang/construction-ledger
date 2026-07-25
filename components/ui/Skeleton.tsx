// Shared shimmer primitive for Suspense fallbacks — sized to match the real
// content it stands in for, so streaming a section in doesn't shift layout.
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} style={style} />;
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <Skeleton className="h-[11px] w-20" />
      <Skeleton className="mt-3 h-8 w-28" />
    </div>
  );
}

export function ChartSkeleton({ height = 160 }: { height?: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
