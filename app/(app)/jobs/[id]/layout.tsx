import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries";
import { getJobProfitability } from "@/lib/reports";
import { Money } from "@/components/Money";
import { JobTabs } from "@/components/JobTabs";
import { JobStatusMenu } from "@/components/JobStatusMenu";

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const job = await getJob(jobId);
  if (!job) notFound();

  const { profitability } = await getJobProfitability(jobId);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-accent">Job</div>
          <h1 className="mt-1 text-2xl font-semibold text-text">{job.name}</h1>
          <p className="mt-1 font-mono text-sm tabular-nums text-text-3">
            {job.code}
            {job.clientName ? ` — ${job.clientName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-6 sm:gap-8">
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
              Contract Value
            </div>
            <div className="mt-1 font-mono text-lg font-medium tabular-nums text-text">
              {job.contractValue !== null ? <Money value={job.contractValue} /> : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
              Projected Margin
            </div>
            <div className="mt-1 font-mono text-lg font-medium tabular-nums">
              <Money value={profitability.projectedMargin} colorize />
            </div>
          </div>
          <JobStatusMenu jobId={jobId} status={job.status} />
        </div>
      </div>

      <JobTabs jobId={jobId} />

      {children}
    </div>
  );
}
