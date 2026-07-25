import Link from "next/link";
import { Suspense } from "react";
import { getJobProfitability, getJobCostTrend } from "@/lib/reports";
import { resolveDateRangeParams, ResolvedDateRange } from "@/lib/date-range";
import { formatUSD } from "@/lib/money";
import { StatCard } from "@/components/ui/StatCard";
import { AreaChart } from "@/components/ui/AreaChart";
import { DateRangeControl } from "@/components/ui/DateRangeControl";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/Skeleton";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form";

// Stat cards and the cost trend chart are independent hledger-backed
// queries — each streams in via its own Suspense boundary rather than
// blocking the whole page on both.
export default async function JobOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const range = resolveDateRangeParams(await searchParams);

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <Link href={`/jobs/${jobId}/transactions/expenses/new`} className={primaryButtonClass}>
          Record Expense
        </Link>
        <Link href={`/jobs/${jobId}/transactions/payments/new`} className={secondaryButtonClass}>
          Record Payment
        </Link>
        <Link href={`/jobs/${jobId}/billings/new`} className={secondaryButtonClass}>
          Create Progress Billing
        </Link>
      </div>

      <Suspense fallback={<StatCardsSkeleton />}>
        <StatCards jobId={jobId} />
      </Suspense>

      <DateRangeControl basePath={`/jobs/${jobId}`} resolved={range} />

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
          Costs by Month
        </div>
        <div className="mt-4">
          <Suspense fallback={<ChartSkeleton />}>
            <CostTrendChart jobId={jobId} range={range} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function StatCardsSkeleton() {
  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </section>
  );
}

async function StatCards({ jobId }: { jobId: number }) {
  const { wip, profitability, cfoPctCompleteEstimate } = await getJobProfitability(jobId);
  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <StatCard label="Revised Contract Value" value={formatUSD(wip.revisedContractValue)} />
      <StatCard label="% Complete" value={`${wip.pctComplete.times(100).toFixed(1)}%`} />
      <StatCard
        label="CFO % Est."
        value={cfoPctCompleteEstimate ? `${cfoPctCompleteEstimate.toFixed(1)}%` : "—"}
      />
      <StatCard label="Costs to Date" value={formatUSD(wip.costsToDate)} />
      <StatCard label="Estimated Total Cost" value={formatUSD(wip.estimatedTotalCost)} />
      <StatCard label="Earned Revenue" value={formatUSD(wip.earnedRevenue)} />
      <StatCard label="Billed to Date" value={formatUSD(wip.billedToDate)} />
      <StatCard
        label="Over / Under Billed"
        value={formatUSD(wip.overUnderBilling)}
        tone={wip.overUnderBilling.isNegative() ? "negative" : "positive"}
      />
      <StatCard
        label="Actual Margin to Date"
        value={formatUSD(profitability.actualMarginToDate)}
        tone={profitability.actualMarginToDate.isNegative() ? "negative" : "positive"}
      />
    </section>
  );
}

async function CostTrendChart({ jobId, range }: { jobId: number; range: ResolvedDateRange }) {
  const costTrend = await getJobCostTrend(jobId, range);
  return <AreaChart points={costTrend.map((p) => ({ label: p.month, value: p.costs }))} format="usd" />;
}
