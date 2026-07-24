import Link from "next/link";
import { getCashPositionSummary, getWipScheduleForActiveJobs, getRetainageAging } from "@/lib/reports";
import { Money } from "@/components/Money";

const RETAINAGE_OVERDUE_DAYS = 60;

export default async function DashboardPage() {
  const [cash, wipReports] = await Promise.all([
    getCashPositionSummary(),
    getWipScheduleForActiveJobs(),
  ]);

  const retainageReports = await Promise.all(wipReports.map((r) => getRetainageAging(r.jobId)));
  const overdueRetainage = retainageReports.flatMap((r) =>
    r.billings
      .filter((b) => b.daysOutstanding >= RETAINAGE_OVERDUE_DAYS)
      .map((b) => ({ jobId: r.jobId, jobCode: r.jobCode, jobName: r.jobName, ...b })),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-medium text-neutral-500">Cash Position</h2>
        <p className="mt-2 text-3xl font-semibold">
          <Money value={cash.netCash} colorize />
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Assets</dt>
            <dd className="text-lg">
              <Money value={cash.assetsTotal} />
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Liabilities</dt>
            <dd className="text-lg">
              <Money value={cash.liabilitiesTotal} />
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Active Jobs</h2>
        {wipReports.length === 0 ? (
          <p className="text-neutral-500">
            No active jobs yet.{" "}
            <Link href="/jobs/new" className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-4 py-2 font-medium">% Complete</th>
                  <th className="px-4 py-2 font-medium">Billed</th>
                  <th className="px-4 py-2 font-medium">Earned</th>
                  <th className="px-4 py-2 font-medium">Over/Under Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {wipReports.map((r) => (
                  <tr key={r.jobId}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/jobs/${r.jobId}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {r.jobName}
                      </Link>
                      <div className="text-xs text-neutral-500">{r.jobCode}</div>
                    </td>
                    <td className="px-4 py-2">{r.wip.pctComplete.times(100).toFixed(1)}%</td>
                    <td className="px-4 py-2">
                      <Money value={r.wip.billedToDate} />
                    </td>
                    <td className="px-4 py-2">
                      <Money value={r.wip.earnedRevenue} />
                    </td>
                    <td className="px-4 py-2">
                      <Money value={r.wip.overUnderBilling} colorize />{" "}
                      <span className="text-xs text-neutral-500">
                        {r.wip.overUnderBilling.isZero()
                          ? ""
                          : r.wip.overUnderBilling.isPositive()
                            ? "(overbilled)"
                            : "(underbilled)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {overdueRetainage.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-amber-700">
            Retainage Outstanding {RETAINAGE_OVERDUE_DAYS}+ Days
          </h2>
          <ul className="space-y-2">
            {overdueRetainage.map((b, i) => (
              <li
                key={i}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm"
              >
                <Link href={`/jobs/${b.jobId}`} className="font-medium hover:underline">
                  {b.jobName}
                </Link>{" "}
                ({b.jobCode}) — {b.periodLabel ?? "billing"}:{" "}
                <Money value={b.retainageWithheld} /> outstanding {b.daysOutstanding} days
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
