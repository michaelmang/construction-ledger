import Link from "next/link";
import { listBillings } from "@/lib/queries";
import { Money } from "@/components/Money";
import { BillingActions } from "./BillingActions";
import { Pill, PillTone } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";
import { primaryButtonClass } from "@/components/form";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

const STATUS_TONE: Record<string, PillTone> = {
  paid: "positive",
  partial: "warn",
  unpaid: "neutral",
};

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
        <Link href={`/jobs/${jobId}/billings/new`} className={primaryButtonClass}>
          New Progress Billing
        </Link>
      </div>

      {billings.length === 0 ? (
        <EmptyState
          label="No Progress Billings"
          message="Create a pay app to start billing this job."
          actionHref={`/jobs/${jobId}/billings/new`}
          actionLabel="New Progress Billing"
        />
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Period</th>
                <th className={thClass}>Amount Billed</th>
                <th className={thClass}>Retainage Withheld</th>
                <th className={thClass}>Paid</th>
                <th className={thClass}>Status</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {billings.map((b) => (
                <tr key={b.id} className={trClass}>
                  <td className="px-4 py-3 font-mono text-sm tabular-nums text-text-3">
                    {b.billingDate?.toISOString().slice(0, 10) ?? "—"}
                  </td>
                  <td className={tdClass}>{b.periodLabel ?? "—"}</td>
                  <td className={tdNumericClass}>
                    <Money value={b.amountBilled} />
                  </td>
                  <td className={tdNumericClass}>
                    <Money value={b.retainageWithheld} />
                  </td>
                  <td className={tdNumericClass}>
                    <Money value={b.paidAmount} />
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[b.status] ?? "neutral"}>{b.status}</Pill>
                  </td>
                  <td className="px-4 py-3">
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
