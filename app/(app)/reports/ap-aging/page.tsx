import { getApAging } from "@/lib/reports";
import { listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";

export const dynamic = "force-dynamic";

export default async function ApAgingReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const asOf = filters.asOf ?? new Date();
  const [rows, jobsRaw] = await Promise.all([getApAging(asOf, filters.jobId), listJobs()]);
  const jobs = jobsRaw.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const csvHref = `/api/reports/ap-aging${reportFilterQueryString(raw)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AP Aging</h1>
        <a
          href={csvHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>
      <p className="text-sm text-text-3">
        What&apos;s still owed on every open vendor bill, net of retainage withheld and
        payments already made.
      </p>

      <ReportFilterBar basePath="/reports/ap-aging" jobs={jobs} raw={raw} />
      {filters.jobId && (
        <p className="text-xs text-text-3">
          Filtered to this job&apos;s bills — overhead bills (not tied to any job) are hidden.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-text-3">Nothing outstanding.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Bill Date</th>
                <th className="px-4 py-2 font-medium">Amount Due</th>
                <th className="px-4 py-2 font-medium">Days Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.billId}>
                  <td className="px-4 py-2 font-medium">{r.vendorName}</td>
                  <td className="px-4 py-2 text-text-2">{r.description ?? "—"}</td>
                  <td className="px-4 py-2 text-text-2">
                    {r.billDate.toISOString().slice(0, 10)}
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
