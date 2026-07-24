import Link from "next/link";
import { getJobProfitability, getJobCostTrend } from "@/lib/reports";
import { formatUSD } from "@/lib/money";
import { StatCard } from "@/components/ui/StatCard";
import { AreaChart } from "@/components/ui/AreaChart";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form";

export default async function JobOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const [{ wip, profitability, cfoPctCompleteEstimate }, costTrend] = await Promise.all([
    getJobProfitability(jobId),
    getJobCostTrend(jobId),
  ]);

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

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
          Costs by Month
        </div>
        <div className="mt-4">
          <AreaChart points={costTrend.map((p) => ({ label: p.month, value: p.costs }))} format="usd" />
        </div>
      </section>
    </div>
  );
}
