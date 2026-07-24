import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries";
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

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{job.name}</h1>
            <p className="text-sm text-neutral-500">
              {job.code}
              {job.clientName ? ` — ${job.clientName}` : ""}
            </p>
          </div>
          <div className="flex items-start gap-6">
            <div className="text-right text-sm">
              <div className="text-neutral-500">Contract Value</div>
              <div className="text-lg font-medium">
                {job.contractValue !== null ? <Money value={job.contractValue} /> : "—"}
              </div>
            </div>
            <JobStatusMenu jobId={jobId} status={job.status} />
          </div>
        </div>
      </div>

      <JobTabs jobId={jobId} />

      {children}
    </div>
  );
}
