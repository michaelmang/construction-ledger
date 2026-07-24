import { getJob, getJobTransactions } from "@/lib/queries";
import { humanizeAccount } from "@/lib/accounts";
import { Money } from "@/components/Money";

export default async function JobTransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const jobId = Number(id);

  const job = await getJob(jobId);
  if (!job) return null;

  const entries = await getJobTransactions(job.code);
  const filtered = q
    ? entries.filter((e) => e.description.toLowerCase().includes(q.toLowerCase()))
    : entries;

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter by description…"
          className="w-64 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Filter
        </button>
      </form>

      {filtered.length === 0 ? (
        <p className="text-neutral-500">No transactions.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((entry, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-neutral-600">{entry.date}</td>
                  <td className="px-4 py-2">{entry.description}</td>
                  <td className="px-4 py-2 text-neutral-600">{humanizeAccount(entry.account)}</td>
                  <td className="px-4 py-2 text-right">
                    <Money value={entry.amount} colorize />
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
