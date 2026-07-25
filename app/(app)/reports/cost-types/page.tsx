import Link from "next/link";
import { getCostTypePivotByJob } from "@/lib/reports";
import { Money } from "@/components/Money";

export const dynamic = "force-dynamic";

export default async function CostTypesReportPage() {
  const rows = await getCostTypePivotByJob(["active", "complete"]);
  const hasUntyped = rows.some((r) => !r.untyped.isZero());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cost by Type</h1>
        <a
          href="/api/reports/cost-types"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>
      <p className="text-sm text-text-3">
        Labor, material, subcontract, and equipment cost across every job — a labor-heavy job
        carries different margin risk than one that&apos;s mostly subbed out (v3 spec §F17/§F19).
      </p>

      {rows.length === 0 ? (
        <p className="text-text-3">No jobs with recorded costs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Labor</th>
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">Subcontract</th>
                <th className="px-4 py-2 font-medium">Equipment</th>
                <th className="px-4 py-2 font-medium">Other</th>
                {hasUntyped && <th className="px-4 py-2 font-medium">Untyped</th>}
                <th className="px-4 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.jobId}>
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
                      {r.jobName}
                    </Link>
                    <div className="text-xs text-text-3">{r.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.labor} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.material} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.subcontract} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.equipment} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.other} />
                  </td>
                  {hasUntyped && (
                    <td className="px-4 py-2">
                      {r.untyped.isZero() ? (
                        <span className="text-text-3">—</span>
                      ) : (
                        <span className="text-accent">
                          <Money value={r.untyped} />
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2 font-medium">
                    <Money value={r.total} />
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
