import Link from "next/link";
import { getArAgingForActiveJobs } from "@/lib/reports";
import { listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";

export const dynamic = "force-dynamic";

export default async function ArAgingReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const asOf = filters.asOf ?? new Date();
  const [reports, jobsRaw] = await Promise.all([
    getArAgingForActiveJobs(asOf, ["active", "complete"], filters.jobId),
    listJobs(),
  ]);
  const jobs = jobsRaw.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const rows = reports.flatMap((r) =>
    r.rows.map((row) => ({
      jobId: r.jobId,
      jobCode: r.jobCode,
      jobName: r.jobName,
      ...row,
    })),
  );
  const csvHref = `/api/reports/ar-aging${reportFilterQueryString(raw)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AR Aging</h1>
        <a
          href={csvHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>
      <p className="text-sm text-text-3">
        What clients still owe on each progress billing, net of retainage and any
        payments already applied.
      </p>

      <ReportFilterBar basePath="/reports/ar-aging" jobs={jobs} raw={raw} />

      {rows.length === 0 ? (
        <p className="text-text-3">Nothing outstanding.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Billing Date</th>
                <th className="px-4 py-2 font-medium">Amount Due</th>
                <th className="px-4 py-2 font-medium">Days Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.billingId}>
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
                      {r.jobName}
                    </Link>
                    <div className="text-xs text-text-3">{r.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">{r.periodLabel ?? "—"}</td>
                  <td className="px-4 py-2 text-text-2">
                    {r.billingDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2">
                    <Money value={r.amountDue} />
                  </td>
                  <td className="px-4 py-2">
                    <span className={r.daysOutstanding >= 60 ? "font-medium text-negative" : ""}>
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
