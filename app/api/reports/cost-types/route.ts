import { getCostTypePivotByJob } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

// Fans out one hledger balance call per cost type, plus one for untyped.
export const maxDuration = 30;

export async function GET() {
  const rows = await getCostTypePivotByJob(["active", "complete"]);

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
