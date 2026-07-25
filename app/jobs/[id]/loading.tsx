import { Skeleton, StatCardSkeleton } from "@/components/ui/Skeleton";

// Covers the JobLayout segment too (its own job/profitability fetch blocks
// before the header and tabs render), not just page.tsx's content.
export default function JobLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-[11px] w-10" />
          <Skeleton className="mt-2 h-7 w-52" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <div className="flex items-start gap-8">
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-8 w-full max-w-md" />
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </section>
    </div>
  );
}
