import { getRetainageAgingForActiveJobs } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const reports = await getRetainageAgingForActiveJobs();
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
