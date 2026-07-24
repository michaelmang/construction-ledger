import Link from "next/link";
import { revalidatePath } from "next/cache";
import { listChangeOrders } from "@/lib/queries";
import { setChangeOrderStatus } from "@/app/actions/change-orders";
import { Money } from "@/components/Money";

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
        <Link
          href={`/jobs/${jobId}/change-orders/new`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New Change Order
        </Link>
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-neutral-500">No change orders yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">CO #</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {changeOrders.map((co) => (
                <tr key={co.id}>
                  <td className="px-4 py-2">{co.coNumber ?? "—"}</td>
                  <td className="px-4 py-2">{co.description ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Money value={co.amount} colorize />
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        co.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : co.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {co.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {co.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <form action={approve}>
                          <input type="hidden" name="id" value={co.id} />
                          <button type="submit" className="text-xs text-green-700 hover:underline">
                            Approve
                          </button>
                        </form>
                        <form action={reject}>
                          <input type="hidden" name="id" value={co.id} />
                          <button type="submit" className="text-xs text-red-700 hover:underline">
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
