import Link from "next/link";
import { listBillings } from "@/lib/queries";
import { Money } from "@/components/Money";

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
