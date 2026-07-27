import Link from "next/link";
import { getProfitabilityForActiveJobs } from "@/lib/reports";
import { listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";

// Fans out one hledger call per active/complete job.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export default async function ProfitabilityReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const [rows, jobsRaw] = await Promise.all([
    getProfitabilityForActiveJobs(["active", "complete"], filters),
    listJobs(),
  ]);
  const jobs = jobsRaw.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const csvHref = `/api/reports/profitability${reportFilterQueryString(raw)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Job Profitability</h1>
        <a
          href={csvHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>

      <ReportFilterBar basePath="/reports/profitability" jobs={jobs} raw={raw} showCostTypes />

      {rows.length === 0 ? (
        <p className="text-text-3">No jobs match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Revised Contract</th>
                <th className="px-4 py-2 font-medium">Est. Total Cost</th>
                <th className="px-4 py-2 font-medium">Projected Margin</th>
                <th className="px-4 py-2 font-medium">Earned Revenue</th>
                <th className="px-4 py-2 font-medium">Costs to Date</th>
                <th className="px-4 py-2 font-medium">Actual Margin to Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.jobId}>
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
                      {r.jobName}
                    </Link>
                    <div className="text-xs text-text-3">{r.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.revisedContractValue} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.estimatedTotalCost} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.profitability.projectedMargin} colorize />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.earnedRevenue} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.costsToDate} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.profitability.actualMarginToDate} colorize />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
