import Link from "next/link";
import Decimal from "decimal.js";
import { getJobProfitability } from "@/lib/reports";
import { Money } from "@/components/Money";

export default async function JobOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const { wip, profitability, cfoPctCompleteEstimate } = await getJobProfitability(jobId);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Link
          href={`/jobs/${jobId}/transactions/expenses/new`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Record Expense
        </Link>
        <Link
          href={`/jobs/${jobId}/transactions/payments/new`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Record Payment
        </Link>
        <Link
          href={`/jobs/${jobId}/billings/new`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Create Progress Billing
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Revised Contract Value" value={wip.revisedContractValue} />
        <Stat label="% Complete" text={`${wip.pctComplete.times(100).toFixed(1)}%`} />
        <Stat
          label="CFO % Est."
          text={cfoPctCompleteEstimate ? `${cfoPctCompleteEstimate.toFixed(1)}%` : "—"}
        />
        <Stat label="Costs to Date" value={wip.costsToDate} />
        <Stat label="Estimated Total Cost" value={wip.estimatedTotalCost} />
        <Stat label="Earned Revenue" value={wip.earnedRevenue} />
        <Stat label="Billed to Date" value={wip.billedToDate} />
        <Stat label="Over / Under Billed" value={wip.overUnderBilling} colorize />
        <Stat label="Projected Margin" value={profitability.projectedMargin} colorize />
        <Stat label="Actual Margin to Date" value={profitability.actualMarginToDate} colorize />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  text,
  colorize,
}: {
  label: string;
  value?: Decimal;
  text?: string;
  colorize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">
        {text ?? (value !== undefined ? <Money value={value} colorize={colorize} /> : "—")}
      </div>
    </div>
  );
}
