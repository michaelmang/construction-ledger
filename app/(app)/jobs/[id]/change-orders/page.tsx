import Link from "next/link";
import { revalidatePath } from "next/cache";
import { listChangeOrders } from "@/lib/queries";
import { setChangeOrderStatus } from "@/app/actions/change-orders";
import { Money } from "@/components/Money";
import { Pill, PillTone } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";
import { primaryButtonClass } from "@/components/form";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

const STATUS_TONE: Record<string, PillTone> = {
  approved: "positive",
  rejected: "negative",
  pending: "neutral",
};

export default async function JobChangeOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const changeOrders = await listChangeOrders(jobId);

  async function approve(formData: FormData) {
    "use server";
    await setChangeOrderStatus({ id: Number(formData.get("id")), status: "approved" });
    revalidatePath(`/jobs/${jobId}/change-orders`);
  }

  async function reject(formData: FormData) {
    "use server";
    await setChangeOrderStatus({ id: Number(formData.get("id")), status: "rejected" });
    revalidatePath(`/jobs/${jobId}/change-orders`);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/jobs/${jobId}/change-orders/new`} className={primaryButtonClass}>
          New Change Order
        </Link>
      </div>

      {changeOrders.length === 0 ? (
        <EmptyState
          label="No Change Orders"
          message="Log a change order to feed it into the revised contract value."
          actionHref={`/jobs/${jobId}/change-orders/new`}
          actionLabel="New Change Order"
        />
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>CO #</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {changeOrders.map((co) => (
                <tr key={co.id} className={trClass}>
                  <td className={`${tdClass} font-mono tabular-nums`}>{co.coNumber ?? "—"}</td>
                  <td className={tdClass}>{co.description ?? "—"}</td>
                  <td className={tdNumericClass}>
                    <Money value={co.amount} colorize />
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[co.status] ?? "neutral"}>{co.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {co.status === "pending" && (
                      <div className="flex justify-end gap-3">
                        <form action={approve}>
                          <input type="hidden" name="id" value={co.id} />
                          <button type="submit" className="text-xs text-positive hover:underline">
                            Approve
                          </button>
                        </form>
                        <form action={reject}>
                          <input type="hidden" name="id" value={co.id} />
                          <button type="submit" className="text-xs text-negative hover:underline">
                            Reject
                          </button>
                        </form>
                      </div>
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
