import { getArAgingForActiveJobs } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const reports = await getArAgingForActiveJobs(new Date(), ["active", "complete"]);
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
