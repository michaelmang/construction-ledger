import { NextRequest } from "next/server";
import { getCostCodeBreakdown } from "@/lib/reports";
import { prisma } from "@/lib/db";
import { parseReportFilters } from "@/lib/report-filters";
import { toCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseReportFilters({
    jobId: sp.get("jobId") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
    costType: sp.getAll("costType"),
  });

  if (!filters.jobId) {
    return new Response("jobId is required", { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { id: filters.jobId } });
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const rows = await getCostCodeBreakdown(filters.jobId, filters);

  const csv = toCsv(
    ["Cost Code", "Cost Code Name", "Budget + Changes", "Cost to Date", "% Complete", "Remaining"],
    rows.map((r) => [
      r.costCode,
      r.costCodeName,
      r.estimatedAtCompletion.toFixed(2),
      r.actual.toFixed(2),
      r.estimatedAtCompletion.isZero() ? "0.0" : r.actual.dividedBy(r.estimatedAtCompletion).times(100).toFixed(1),
      r.remaining.toFixed(2),
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="cost-by-code-${job.code}.csv"`,
    },
  });
}
