import { NextRequest } from "next/server";
import { getCostTypePivotByJob } from "@/lib/reports";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

// Fans out one hledger balance call per cost type, plus one for untyped.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
  });
  const rows = await getCostTypePivotByJob(["active", "complete"], filters);

  const csv = toCsv(
    ["Job Code", "Job Name", "Labor", "Material", "Subcontract", "Equipment", "Other", "Untyped", "Total"],
    rows.map((r) => [
      r.jobCode,
      r.jobName,
      r.labor.toFixed(2),
      r.material.toFixed(2),
      r.subcontract.toFixed(2),
      r.equipment.toFixed(2),
      r.other.toFixed(2),
      r.untyped.toFixed(2),
      r.total.toFixed(2),
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="cost-types-by-job.csv"',
    },
  });
}
