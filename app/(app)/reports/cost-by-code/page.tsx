import Decimal from "decimal.js";
import { getCostCodeBreakdown } from "@/lib/reports";
import { listJobs } from "@/lib/queries";
import { parseReportFilters, reportFilterQueryString, ReportFilterParams } from "@/lib/report-filters";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  tableWrapClass,
  tableClass,
  theadClass,
  thClass,
  tbodyClass,
  trClass,
  tdClass,
  tdNumericClass,
} from "@/components/table";

export const dynamic = "force-dynamic";

function pctComplete(actual: Decimal, estimatedAtCompletion: Decimal): string {
  if (estimatedAtCompletion.isZero()) return "0.0";
  return actual.dividedBy(estimatedAtCompletion).times(100).toFixed(1);
}

// v6 spec (report filters): one job's cost codes as rows, Schedule-of-Values
// style, mirroring the PM-provided screenshot — but showing only what this
// app's data model actually supports per cost code (Budget+Changes, Cost to
// Date, % Complete, Remaining). ProgressBilling is job-level only with no
// cost-code allocation, so Billed to Date/Retention/Net Billing/% Billed/
// Cash Flow aren't reconstructable per code without inventing a proration —
// deliberately omitted rather than shown as an approximation.
export default async function CostByCodeReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilterParams>;
}) {
  const raw = await searchParams;
  const jobs = await listJobs();

  if (jobs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Cost by Code" />
        <EmptyState
          label="No Jobs"
          message="Create a job first — this report shows one job's cost codes at a time."
          actionHref="/jobs/new"
          actionLabel="Create a Job"
        />
      </div>
    );
  }

  const filters = parseReportFilters(raw);
  const defaultJobId = jobs.find((j) => j.status === "active")?.id ?? jobs[0].id;
  const jobId = filters.jobId ?? defaultJobId;
  const job = jobs.find((j) => j.id === jobId) ?? jobs[0];

  const rows = await getCostCodeBreakdown(job.id, { asOf: filters.asOf, costTypes: filters.costTypes });
  const totals = rows.reduce(
    (acc, r) => ({
      estimatedAtCompletion: acc.estimatedAtCompletion.plus(r.estimatedAtCompletion),
      actual: acc.actual.plus(r.actual),
      remaining: acc.remaining.plus(r.remaining),
    }),
    { estimatedAtCompletion: new Decimal(0), actual: new Decimal(0), remaining: new Decimal(0) },
  );

  const jobList = jobs.map((j) => ({ id: j.id, code: j.code, name: j.name }));
  const csvHref = `/api/reports/cost-by-code${reportFilterQueryString({ ...raw, jobId: String(job.id) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Cost by Code"
        action={
          <a
            href={csvHref}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-2 hover:bg-surface-2"
          >
            Download CSV
          </a>
        }
      />
      <p className="text-sm text-text-3">
        {job.name} ({job.code}) — budget, cost-to-date, and remaining per cost code.
      </p>

      <ReportFilterBar
        basePath="/reports/cost-by-code"
        jobs={jobList}
        raw={{ ...raw, jobId: String(job.id) }}
        showCostTypes
        jobRequired
      />

      {rows.length === 0 ? (
        <EmptyState label="No Cost Codes" message="This job has no budgeted cost codes yet." />
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Cost Code</th>
                <th className={thClass}>Budget + Changes</th>
                <th className={thClass}>Cost to Date</th>
                <th className={thClass}>% Complete</th>
                <th className={thClass}>Remaining</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {rows.map((r) => (
                <tr key={r.costCodeId} className={trClass}>
                  <td className={tdClass}>
                    <div className="font-medium text-text">{r.costCodeName}</div>
                    <div className="font-mono text-xs tabular-nums text-text-3">{r.costCode}</div>
                  </td>
                  <td className={tdNumericClass}>
                    <Money value={r.estimatedAtCompletion} />
                  </td>
                  <td className={tdNumericClass}>
                    <Money value={r.actual} />
                  </td>
                  <td className={tdNumericClass}>{pctComplete(r.actual, r.estimatedAtCompletion)}%</td>
                  <td className={tdNumericClass}>
                    <Money value={r.remaining} colorize />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className={tdClass}>Totals</td>
                <td className={tdNumericClass}>
                  <Money value={totals.estimatedAtCompletion} />
                </td>
                <td className={tdNumericClass}>
                  <Money value={totals.actual} />
                </td>
                <td className={tdNumericClass}>{pctComplete(totals.actual, totals.estimatedAtCompletion)}%</td>
                <td className={tdNumericClass}>
                  <Money value={totals.remaining} colorize />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
