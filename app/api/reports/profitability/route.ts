import { NextRequest } from "next/server";
import { getProfitabilityForActiveJobs } from "@/lib/reports";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

// Fans out one hledger call per active/complete job.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
    costType: sp.getAll("costType"),
  });
  const rows = await getProfitabilityForActiveJobs(["active", "complete"], filters);

  const csv = toCsv(
    [
      "Job Code",
      "Job Name",
      "Revised Contract Value",
      "Estimated Total Cost",
      "Projected Margin",
      "Earned Revenue",
      "Costs to Date",
      "Actual Margin to Date",
    ],
    rows.map((r) => [
      r.jobCode,
      r.jobName,
      r.wip.revisedContractValue.toFixed(2),
      r.wip.estimatedTotalCost.toFixed(2),
      r.profitability.projectedMargin.toFixed(2),
      r.wip.earnedRevenue.toFixed(2),
      r.wip.costsToDate.toFixed(2),
      r.profitability.actualMarginToDate.toFixed(2),
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="job-profitability.csv"',
    },
  });
}
