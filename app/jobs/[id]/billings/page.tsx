import Link from "next/link";
import { listBillings } from "@/lib/queries";
import { Money } from "@/components/Money";
import { BillingActions } from "./BillingActions";

export default async function JobBillingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const billings = await listBillings(jobId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={`/jobs/${jobId}/billings/new`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New Progress Billing
        </Link>
      </div>

      {billings.length === 0 ? (
        <p className="text-neutral-500">No progress billings yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Amount Billed</th>
                <th className="px-4 py-2 font-medium">Retainage Withheld</th>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {billings.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 text-neutral-600">
                    {b.billingDate?.toISOString().slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-4 py-2">{b.periodLabel ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Money value={b.amountBilled} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={b.retainageWithheld} />
                  </td>
                  <td className="px-4 py-2">
                    <Money value={b.paidAmount} />
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        b.status === "paid"
                          ? "bg-green-100 text-green-700"
                          : b.status === "partial"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {b.txnid && b.paidAmount.equals(0) && (
                      <BillingActions jobId={jobId} billingId={b.id} />
                    )}
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
