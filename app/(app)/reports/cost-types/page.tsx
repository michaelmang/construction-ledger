import Link from "next/link";
import { getCostTypePivotByJob } from "@/lib/reports";
import { listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";

export const dynamic = "force-dynamic";
// Fans out one hledger balance call per cost type, plus one for untyped.
export const maxDuration = 30;

// This report is already broken out by cost type (one column per type), so
// its Cost Type filter just hides non-selected columns client-side — no
// data-layer scoping needed, unlike WIP/Profitability where it narrows
// Costs to Date (see lib/reports.ts's getWipSchedule for that distinction).
export default async function CostTypesReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const [rows, jobsRaw] = await Promise.all([
    getCostTypePivotByJob(["active", "complete"], filters),
    listJobs(),
  ]);
  const jobs = jobsRaw.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const hasUntyped = rows.some((r) => !r.untyped.isZero());
  const shownTypes = filters.costTypes ?? ["labor", "material", "subcontract", "equipment", "other"];
  const csvHref = `/api/reports/cost-types${reportFilterQueryString(raw)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cost by Type</h1>
        <a
          href={csvHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>
      <p className="text-sm text-text-3">
        Labor, material, subcontract, and equipment cost across every job — a labor-heavy job
        carries different margin risk than one that&apos;s mostly subbed out (v3 spec §F17/§F19).
      </p>

      <ReportFilterBar basePath="/reports/cost-types" jobs={jobs} raw={raw} showCostTypes />
      {filters.costTypes && (
        <p className="text-xs text-text-3">
          Showing only the selected cost type(s) above — Total still reflects every cost type on
          the job, not just what&apos;s shown.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-text-3">No jobs match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                {shownTypes.includes("labor") && <th className="px-4 py-2 font-medium">Labor</th>}
                {shownTypes.includes("material") && <th className="px-4 py-2 font-medium">Material</th>}
                {shownTypes.includes("subcontract") && (
                  <th className="px-4 py-2 font-medium">Subcontract</th>
                )}
                {shownTypes.includes("equipment") && <th className="px-4 py-2 font-medium">Equipment</th>}
                {shownTypes.includes("other") && <th className="px-4 py-2 font-medium">Other</th>}
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
                  {shownTypes.includes("labor") && (
                    <td className="px-4 py-2">
                      <Money value={r.labor} />
                    </td>
                  )}
                  {shownTypes.includes("material") && (
                    <td className="px-4 py-2">
                      <Money value={r.material} />
                    </td>
                  )}
                  {shownTypes.includes("subcontract") && (
                    <td className="px-4 py-2">
                      <Money value={r.subcontract} />
                    </td>
                  )}
                  {shownTypes.includes("equipment") && (
                    <td className="px-4 py-2">
                      <Money value={r.equipment} />
                    </td>
                  )}
                  {shownTypes.includes("other") && (
                    <td className="px-4 py-2">
                      <Money value={r.other} />
                    </td>
                  )}
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
