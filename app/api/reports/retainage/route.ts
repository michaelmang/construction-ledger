import { NextRequest } from "next/server";
import { getRetainageAgingForActiveJobs } from "@/lib/reports";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

// Fans out two hledger balance calls per active/complete job.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
  });
  const asOf = filters.asOf ?? new Date();
  const reports = await getRetainageAgingForActiveJobs(asOf, ["active", "complete"], filters.jobId);
  const rows = reports.flatMap((r) =>
    r.billings.map((b) => [
      r.jobCode,
      r.jobName,
      b.periodLabel ?? "",
      b.billingDate.toISOString().slice(0, 10),
      b.retainageWithheld.toFixed(2),
      b.daysOutstanding,
    ]),
  );

  const csv = toCsv(
    ["Job Code", "Job Name", "Period", "Billing Date", "Retainage Withheld", "Days Outstanding"],
    rows,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="retainage-aging.csv"',
    },
  });
}
