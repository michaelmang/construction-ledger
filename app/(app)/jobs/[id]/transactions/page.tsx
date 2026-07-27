import { getJob, getJobTransactionsGrouped, listJobBudgets, listVendors } from "@/lib/queries";
import { Money } from "@/components/Money";
import { TransactionActions } from "./TransactionActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass } from "@/components/table";
import { COST_TYPES, COST_TYPE_LABEL } from "@/lib/cost-types";

const KIND_LABELS: Record<string, string> = {
  expense: "Expense",
  labor: "Labor",
  payment: "Payment",
  "progress-billing": "Progress Billing",
  "bill-payment": "Bill Payment",
  "overhead-expense": "Overhead",
  "opening-balance": "Opening Balance",
  "retainage-release": "Retainage Release",
};

const filterInputClass =
  "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

export default async function JobTransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    costCode?: string;
    vendor?: string;
    kind?: string;
    costType?: string;
  }>;
}) {
  const { id } = await params;
  const { q, from, to, costCode, vendor, kind, costType } = await searchParams;
  const jobId = Number(id);

  const job = await getJob(jobId);
  if (!job) return null;

  const [budgets, vendors] = await Promise.all([listJobBudgets(jobId), listVendors()]);

  const extraQueryTerms: string[] = [];
  if (from) extraQueryTerms.push(`date:${from.replace(/-/g, "")}-`);
  if (to) extraQueryTerms.push(`date:-${to.replace(/-/g, "")}`);
  if (costCode) extraQueryTerms.push(`tag:code=${costCode}`);
  if (vendor) extraQueryTerms.push(`tag:vendor=${vendor}`);
  if (costType) extraQueryTerms.push(`tag:costtype=${costType}`);

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
          <label className="block text-xs text-text-3">Description</label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Filter…"
            className={`w-48 ${filterInputClass}`}
          />
        </div>
        <div>
          <label className="block text-xs text-text-3">From</label>
          <input type="date" name="from" defaultValue={from ?? ""} className={filterInputClass} />
        </div>
        <div>
          <label className="block text-xs text-text-3">To</label>
          <input type="date" name="to" defaultValue={to ?? ""} className={filterInputClass} />
        </div>
        <div>
          <label className="block text-xs text-text-3">Cost Code</label>
          <select name="costCode" defaultValue={costCode ?? ""} className={filterInputClass}>
            <option value="">All</option>
            {budgets.map((b) => (
              <option key={b.costCode.code} value={b.costCode.code}>
                {b.costCode.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-3">Vendor</label>
          <select name="vendor" defaultValue={vendor ?? ""} className={filterInputClass}>
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.name.toLowerCase()}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-3">Type</label>
          <select name="kind" defaultValue={kind ?? ""} className={filterInputClass}>
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-3">Cost Type</label>
          <select name="costType" defaultValue={costType ?? ""} className={filterInputClass}>
            <option value="">All</option>
            {COST_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2">
          Filter
        </button>
      </form>

      {groups.length === 0 ? (
        <EmptyState label="No Transactions" message="Nothing recorded yet for this job." />
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Accounts</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {groups.map((g, i) => (
                <tr key={g.txnid ?? i} className={trClass}>
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-text-3">{g.date}</td>
                  <td className="px-4 py-3 text-sm text-text">{g.description}</td>
                  <td className="px-4 py-3 text-sm text-text-2">
                    {g.kind ? (KIND_LABELS[g.kind] ?? g.kind) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-2">
                    <ul className="space-y-0.5">
                      {g.postings.map((p, j) => (
                        <li key={j} className="flex justify-between gap-4">
                          <span>{p.humanizedAccount}</span>
                          <Money value={p.amount} colorize />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 align-top">
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
