import Link from "next/link";
import { getRetainageAgingForActiveJobs } from "@/lib/reports";
import { listCashAccounts, listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";
import { ReleaseRetainageForm } from "./ReleaseRetainageForm";

// Fans out two hledger balance calls per active/complete job.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export default async function RetainageReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const asOf = filters.asOf ?? new Date();
  const [reports, cashAccountsRaw, jobsRaw] = await Promise.all([
    getRetainageAgingForActiveJobs(asOf, ["active", "complete"], filters.jobId),
    listCashAccounts(),
    listJobs(),
  ]);
  const cashAccounts = cashAccountsRaw.map((a) => ({ name: a.name, label: a.label, isDefault: a.isDefault }));
  const jobs = jobsRaw.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const rows = reports.flatMap((r) =>
    r.billings.map((b) => ({
      jobId: r.jobId,
      jobCode: r.jobCode,
      jobName: r.jobName,
      ...b,
    })),
  );
  const csvHref = `/api/reports/retainage${reportFilterQueryString(raw)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Retainage Aging</h1>
        <a
          href={csvHref}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
        >
          Download CSV
        </a>
      </div>

      <ReportFilterBar basePath="/reports/retainage" jobs={jobs} raw={raw} />

      <div className="grid gap-4 sm:grid-cols-3">
        {reports.map((r) => (
          <div key={r.jobId} className="rounded-lg border border-border bg-surface p-4">
            <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
              {r.jobName}
            </Link>
            <div className="text-xs text-text-3">{r.jobCode}</div>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-text-3">Retainage Payable</dt>
                <dd className="flex items-center gap-2">
                  <Money value={r.retainagePayableBalance} />
                  <ReleaseRetainageForm
                    jobId={r.jobId}
                    direction="payable"
                    balance={r.retainagePayableBalance.toFixed(2)}
                    cashAccounts={cashAccounts}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-text-3">Retainage Receivable</dt>
                <dd className="flex items-center gap-2">
                  <Money value={r.retainageReceivableBalance} />
                  <ReleaseRetainageForm
                    jobId={r.jobId}
                    direction="receivable"
                    balance={r.retainageReceivableBalance.toFixed(2)}
                    cashAccounts={cashAccounts}
                  />
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-text-3">No progress billings yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Billing Date</th>
                <th className="px-4 py-2 font-medium">Retainage Withheld</th>
                <th className="px-4 py-2 font-medium">Days Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    {b.jobName}
                    <div className="text-xs text-text-3">{b.jobCode}</div>
                  </td>
                  <td className="px-4 py-2">{b.periodLabel ?? "—"}</td>
                  <td className="px-4 py-2 text-text-2">
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
