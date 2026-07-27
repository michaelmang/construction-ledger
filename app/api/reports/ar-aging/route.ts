import { NextRequest } from "next/server";
import { getArAgingForActiveJobs } from "@/lib/reports";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
  });
  const asOf = filters.asOf ?? new Date();
  const reports = await getArAgingForActiveJobs(asOf, ["active", "complete"], filters.jobId);
  const rows = reports.flatMap((r) =>
    r.rows.map((row) => [
      r.jobCode,
      r.jobName,
      row.periodLabel ?? "",
      row.billingDate.toISOString().slice(0, 10),
      row.amountDue.toFixed(2),
      row.daysOutstanding,
    ]),
  );

  const csv = toCsv(
    ["Job Code", "Job Name", "Period", "Billing Date", "Amount Due", "Days Outstanding"],
    rows,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="ar-aging.csv"',
    },
  });
}
