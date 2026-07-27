import { NextRequest } from "next/server";
import { getApAging } from "@/lib/reports";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
  });
  const rows = await getApAging(filters.asOf ?? new Date(), filters.jobId);

  const csv = toCsv(
    ["Vendor", "Description", "Bill Date", "Amount Due", "Days Outstanding"],
    rows.map((r) => [
      r.vendorName,
      r.description ?? "",
      r.billDate.toISOString().slice(0, 10),
      r.amountDue.toFixed(2),
      r.daysOutstanding,
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="ap-aging.csv"',
    },
  });
}
