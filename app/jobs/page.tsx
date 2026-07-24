import Link from "next/link";
import { listJobs } from "@/lib/queries";
import { Money } from "@/components/Money";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Link
          href="/jobs/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="text-neutral-500">No jobs yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Contract Value</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {job.name}
                    </Link>
                    <div className="text-xs text-neutral-500">{job.code}</div>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{job.clientName ?? "—"}</td>
                  <td className="px-4 py-2">
                    {job.contractValue !== null ? <Money value={job.contractValue} /> : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize text-neutral-700">
                      {job.status}
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
