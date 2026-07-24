import Link from "next/link";
import { listJobs } from "@/lib/queries";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, PillTone } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";
import { primaryButtonClass } from "@/components/form";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

const STATUS_TONE: Record<string, PillTone> = {
  active: "positive",
  complete: "neutral",
  archived: "negative",
};

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        action={
          <Link href="/jobs/new" className={primaryButtonClass}>
            New Job
          </Link>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          label="No Jobs"
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
                <th className={thClass}>Client</th>
                <th className={thClass}>Contract Value</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {jobs.map((job) => (
                <tr key={job.id} className={trClass}>
                  <td className={tdClass}>
                    <Link href={`/jobs/${job.id}`} className="font-medium text-text hover:underline">
                      {job.name}
                    </Link>
                    <div className="font-mono text-xs tabular-nums text-text-3">{job.code}</div>
                  </td>
                  <td className={tdClass}>{job.clientName ?? "—"}</td>
                  <td className={tdNumericClass}>
                    {job.contractValue !== null ? <Money value={job.contractValue} /> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Pill>
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
