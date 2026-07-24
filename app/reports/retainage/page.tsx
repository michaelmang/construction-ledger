import Link from "next/link";
import { getRetainageAgingForActiveJobs } from "@/lib/reports";
import { Money } from "@/components/Money";

export default async function RetainageReportPage() {
  const reports = await getRetainageAgingForActiveJobs();
  const rows = reports.flatMap((r) =>
    r.billings.map((b) => ({
      jobId: r.jobId,
      jobCode: r.jobCode,
      jobName: r.jobName,
      ...b,
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Retainage Aging</h1>
        <a
          href="/api/reports/retainage"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Download CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <div key={r.jobId} className="rounded-lg border border-neutral-200 bg-white p-4">
            <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
              {r.jobName}
            </Link>
            <div className="text-xs text-neutral-500">{r.jobCode}</div>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Retainage Payable</dt>
                <dd>
                  <Money value={r.retainagePayableBalance} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Retainage Receivable</dt>
                <dd>
                  <Money value={r.retainageReceivableBalance} />
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-neutral-500">No progress billings yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Billing Date</th>
                <th className="px-4 py-2 font-medium">Retainage Withheld</th>
                <th className="px-4 py-2 font-medium">Days Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((b, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    {b.jobName}
                    <div className="text-xs text-neutral-500">{b.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">{b.periodLabel ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {b.billingDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2">
                    <Money value={b.retainageWithheld} />
                  </td>
                  <td className="px-4 py-2">{b.daysOutstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
