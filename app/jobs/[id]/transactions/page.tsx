import { getJob, getJobTransactionsGrouped, listJobBudgets, listVendors } from "@/lib/queries";
import { Money } from "@/components/Money";
import { TransactionActions } from "./TransactionActions";

const KIND_LABELS: Record<string, string> = {
  expense: "Expense",
  payment: "Payment",
  "progress-billing": "Progress Billing",
  "bill-payment": "Bill Payment",
  "overhead-expense": "Overhead",
  "opening-balance": "Opening Balance",
};

export default async function JobTransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string; costCode?: string; vendor?: string; kind?: string }>;
}) {
  const { id } = await params;
  const { q, from, to, costCode, vendor, kind } = await searchParams;
  const jobId = Number(id);

  const job = await getJob(jobId);
  if (!job) return null;

  const [budgets, vendors] = await Promise.all([listJobBudgets(jobId), listVendors()]);

  const extraQueryTerms: string[] = [];
  if (from) extraQueryTerms.push(`date:${from.replace(/-/g, "")}-`);
  if (to) extraQueryTerms.push(`date:-${to.replace(/-/g, "")}`);
  if (costCode) extraQueryTerms.push(`tag:code=${costCode}`);
  if (vendor) extraQueryTerms.push(`tag:vendor=${vendor}`);

  let groups = await getJobTransactionsGrouped(job.code, extraQueryTerms);

  if (q) {
    groups = groups.filter((g) => g.description.toLowerCase().includes(q.toLowerCase()));
  }
  if (kind) {
    groups = groups.filter((g) => g.kind === kind);
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-neutral-500">Description</label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Filter…"
            className="w-48 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Cost Code</label>
          <select
            name="costCode"
            defaultValue={costCode ?? ""}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">All</option>
            {budgets.map((b) => (
              <option key={b.costCode.code} value={b.costCode.code}>
                {b.costCode.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Vendor</label>
          <select
            name="vendor"
            defaultValue={vendor ?? ""}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.name.toLowerCase()}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Type</label>
          <select
            name="kind"
            defaultValue={kind ?? ""}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Filter
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-neutral-500">No transactions.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Accounts</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {groups.map((g, i) => (
                <tr key={g.txnid ?? i}>
                  <td className="px-4 py-2 text-neutral-600">{g.date}</td>
                  <td className="px-4 py-2">{g.description}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {g.kind ? (KIND_LABELS[g.kind] ?? g.kind) : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    <ul className="space-y-0.5">
                      {g.postings.map((p, j) => (
                        <li key={j} className="flex justify-between gap-4">
                          <span>{p.humanizedAccount}</span>
                          <Money value={p.amount} colorize />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {g.txnid && <TransactionActions jobId={jobId} txnid={g.txnid} kind={g.kind} />}
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
