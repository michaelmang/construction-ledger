import { getApAging } from "@/lib/reports";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const rows = await getApAging();

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
