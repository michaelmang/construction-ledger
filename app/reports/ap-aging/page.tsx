import { getApAging } from "@/lib/reports";
import { Money } from "@/components/Money";

export default async function ApAgingReportPage() {
  const rows = await getApAging();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AP Aging</h1>
        <a
          href="/api/reports/ap-aging"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Download CSV
        </a>
      </div>
      <p className="text-sm text-neutral-500">
        What&apos;s still owed on every open vendor bill, net of retainage withheld and
        payments already made.
      </p>

      {rows.length === 0 ? (
        <p className="text-neutral-500">Nothing outstanding.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Bill Date</th>
                <th className="px-4 py-2 font-medium">Amount Due</th>
                <th className="px-4 py-2 font-medium">Days Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.billId}>
                  <td className="px-4 py-2 font-medium">{r.vendorName}</td>
                  <td className="px-4 py-2 text-neutral-600">{r.description ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {r.billDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.amountDue} />
                  </td>
                  <td className="px-4 py-2">
                    <span className={r.daysOutstanding >= 60 ? "font-medium text-red-600" : ""}>
                      {r.daysOutstanding}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
