import { getWipScheduleForActiveJobs } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

// Fans out one hledger call per active/complete job.
export const maxDuration = 30;

export async function GET() {
  const rows = await getWipScheduleForActiveJobs(["active", "complete"]);

  const csv = toCsv(
    [
      "Job Code",
      "Job Name",
      "Revised Contract Value",
      "Costs to Date",
      "Estimated Total Cost",
      "% Complete",
      "CFO % Estimate",
      "Earned Revenue",
      "Billed to Date",
      "Over/Under Billed",
    ],
    rows.map((r) => [
      r.jobCode,
      r.jobName,
      r.wip.revisedContractValue.toFixed(2),
      r.wip.costsToDate.toFixed(2),
      r.wip.estimatedTotalCost.toFixed(2),
      r.wip.pctComplete.times(100).toFixed(1),
      r.cfoPctCompleteEstimate ? r.cfoPctCompleteEstimate.toFixed(1) : "",
      r.wip.earnedRevenue.toFixed(2),
      r.wip.billedToDate.toFixed(2),
      r.wip.overUnderBilling.toFixed(2),
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="wip-schedule.csv"',
    },
  });
}
