import { Skeleton, StatCardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

// Shown by Next during route transitions until the target page's own content
// (or its first non-Suspended chunk) is ready to stream. Pages that split
// their slow sections into inner <Suspense> boundaries (dashboard, job
// overview) move past this almost immediately; simpler pages show it for
// the duration of their single data fetch.
export default function Loading() {
  return (
    <div className="space-y-10">
      <div>
        <Skeleton className="h-[11px] w-16" />
        <Skeleton className="mt-2 h-7 w-40" />
      </div>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>
      <TableSkeleton />
    </div>
  );
}
