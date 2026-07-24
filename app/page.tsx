import Link from "next/link";
import {
  getCashPositionSummary,
  getCashTrend,
  getWipScheduleForActiveJobs,
  getRetainageAgingForActiveJobs,
  getArAgingForActiveJobs,
  getOverBudgetAlerts,
  getDashboardSummary,
} from "@/lib/reports";
import { Money } from "@/components/Money";
import { formatUSD } from "@/lib/money";
import { StatCard } from "@/components/ui/StatCard";
import { Pill } from "@/components/ui/Pill";
import { AreaChart } from "@/components/ui/AreaChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

const RETAINAGE_OVERDUE_DAYS = 60;
const AR_OVERDUE_DAYS = 30;

export default async function DashboardPage() {
  const [cash, trend, wipReports, retainageReports, arReports, overBudget, summary] = await Promise.all([
    getCashPositionSummary(),
    getCashTrend(),
    getWipScheduleForActiveJobs(),
    getRetainageAgingForActiveJobs(),
    getArAgingForActiveJobs(),
    getOverBudgetAlerts(),
    getDashboardSummary(),
  ]);

  const overdueRetainage = retainageReports.flatMap((r) =>
    r.billings
      .filter((b) => b.daysOutstanding >= RETAINAGE_OVERDUE_DAYS)
      .map((b) => ({ jobId: r.jobId, jobCode: r.jobCode, jobName: r.jobName, ...b })),
  );
  const overduePayApps = arReports.flatMap((r) =>
    r.rows
      .filter((row) => row.daysOutstanding >= AR_OVERDUE_DAYS)
      .map((row) => ({ jobId: r.jobId, jobCode: r.jobCode, jobName: r.jobName, ...row })),
  );

  const hasAlerts = overBudget.length > 0 || overdueRetainage.length > 0 || overduePayApps.length > 0;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Overview" title="Dashboard" />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Cash Position"
          value={formatUSD(cash.netCash)}
          tone={cash.netCash.isNegative() ? "negative" : "positive"}
        />
        <StatCard label="AR Outstanding" value={formatUSD(summary.totalArOutstanding)} />
        <StatCard label="AP Open" value={formatUSD(summary.totalApOutstanding)} />
        <StatCard label="Retainage Held" value={formatUSD(summary.totalRetainageHeld)} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
          Cash Trend (8 Weeks)
        </div>
        <div className="mt-4">
          <AreaChart points={trend.map((p) => ({ label: p.date, value: p.netCash }))} format="usd" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-text">Active Jobs</h2>
        {wipReports.length === 0 ? (
          <EmptyState
            label="No Active Jobs"
            message="Set up your first job to start tracking costs and billings."
            actionHref="/jobs/new"
            actionLabel="Create a Job"
          />
        ) : (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Job</th>
                  <th className={thClass}>% Complete</th>
                  <th className={thClass}>Billed</th>
                  <th className={thClass}>Earned</th>
                  <th className={thClass}>Over/Under Billed</th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {wipReports.map((r) => {
                  const pct = r.wip.pctComplete.times(100);
                  const over = pct.greaterThan(100);
                  return (
                    <tr key={r.jobId} className={trClass}>
                      <td className={tdClass}>
                        <Link href={`/jobs/${r.jobId}`} className="font-medium text-text hover:underline">
                          {r.jobName}
                        </Link>
                        <div className="font-mono text-xs tabular-nums text-text-3">{r.jobCode}</div>
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-text">{pct.toFixed(1)}%</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={`h-full ${over ? "bg-negative" : "bg-accent"}`}
                              style={{ width: `${Math.min(pct.toNumber(), 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className={tdNumericClass}>
                        <Money value={r.wip.billedToDate} />
                      </td>
                      <td className={tdNumericClass}>
                        <Money value={r.wip.earnedRevenue} />
                      </td>
                      <td className={tdNumericClass}>
                        <div className="flex items-center justify-end gap-2">
                          <Money value={r.wip.overUnderBilling} colorize />
                          {!r.wip.overUnderBilling.isZero() && (
                            <Pill tone={r.wip.overUnderBilling.isPositive() ? "negative" : "warn"}>
                              {r.wip.overUnderBilling.isPositive() ? "Overbilled" : "Underbilled"}
                            </Pill>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {wipReports.length > 0 && (
          <p className="mt-2 text-xs text-text-3">
            Total over/under billing across active jobs:{" "}
            <Money value={summary.totalOverUnderBilling} colorize />
          </p>
        )}
      </section>

      {hasAlerts && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-text">Alerts</h2>
          <ul className="space-y-2">
            {overBudget.map((a, i) => (
              <li
                key={`ob-${i}`}
                className="flex items-center justify-between rounded-lg border border-negative/30 bg-negative-soft px-4 py-2.5 text-sm"
              >
                <span className="text-text">
                  <Link href={`/jobs/${a.jobId}/cost-codes`} className="font-medium hover:underline">
                    {a.costCodeName}
                  </Link>{" "}
                  on {a.jobCode} is{" "}
                  <span className="font-mono tabular-nums text-negative">
                    {a.utilizationPct.toFixed(0)}%
                  </span>{" "}
                  of estimate
                </span>
                <Pill tone="negative">Over Budget</Pill>
              </li>
            ))}
            {overdueRetainage.map((b, i) => (
              <li
                key={`ret-${i}`}
                className="flex items-center justify-between rounded-lg border border-accent/30 bg-warn-soft px-4 py-2.5 text-sm"
              >
                <span className="text-text">
                  <Link href={`/jobs/${b.jobId}`} className="font-medium hover:underline">
                    {b.jobName}
                  </Link>{" "}
                  ({b.jobCode}) — {b.periodLabel ?? "billing"}: <Money value={b.retainageWithheld} />{" "}
                  retainage outstanding {b.daysOutstanding} days
                </span>
                <Pill tone="warn">Retainage</Pill>
              </li>
            ))}
            {overduePayApps.map((row, i) => (
              <li
                key={`ar-${i}`}
                className="flex items-center justify-between rounded-lg border border-accent/30 bg-warn-soft px-4 py-2.5 text-sm"
              >
                <span className="text-text">
                  <Link href={`/jobs/${row.jobId}`} className="font-medium hover:underline">
                    {row.jobName}
                  </Link>{" "}
                  ({row.jobCode}) — {row.periodLabel ?? "pay app"}: <Money value={row.amountDue} /> unpaid{" "}
                  {row.daysOutstanding} days
                </span>
                <Pill tone="warn">Unpaid</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
