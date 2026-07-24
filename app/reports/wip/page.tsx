import Link from "next/link";
import { getWipScheduleForActiveJobs } from "@/lib/reports";
import { Money } from "@/components/Money";

export default async function WipReportPage() {
  const rows = await getWipScheduleForActiveJobs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WIP Schedule</h1>
        <a
          href="/api/reports/wip"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Download CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="text-neutral-500">No active jobs.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Revised Contract</th>
                <th className="px-4 py-2 font-medium">Costs to Date</th>
                <th className="px-4 py-2 font-medium">Est. Total Cost</th>
                <th className="px-4 py-2 font-medium">% Complete</th>
                <th className="px-4 py-2 font-medium">Earned Revenue</th>
                <th className="px-4 py-2 font-medium">Billed to Date</th>
                <th className="px-4 py-2 font-medium">Over/Under Billed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.jobId}>
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
                      {r.jobName}
                    </Link>
                    <div className="text-xs text-neutral-500">{r.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.revisedContractValue} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.costsToDate} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.estimatedTotalCost} />
                  </td>
                  <td className="px-4 py-2">{r.wip.pctComplete.times(100).toFixed(1)}%</td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.earnedRevenue} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.billedToDate} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.wip.overUnderBilling} colorize />
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
