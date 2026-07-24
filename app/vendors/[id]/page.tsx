import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { getVendor, listBillsForVendor, listCashAccounts } from "@/lib/queries";
import { Money } from "@/components/Money";
import { PayBillForm } from "./PayBillForm";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendorId = Number(id);
  const vendor = await getVendor(vendorId);
  if (!vendor) notFound();

  const [bills, cashAccounts] = await Promise.all([
    listBillsForVendor(vendorId),
    listCashAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{vendor.name}</h1>

      {bills.length === 0 ? (
        <p className="text-neutral-500">No bills recorded for this vendor yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Job / Category</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {bills.map((bill) => {
                const amountDue = new Decimal(bill.amount)
                  .minus(bill.retainageWithheld)
                  .minus(bill.paidAmount);
                return (
                  <tr key={bill.id}>
                    <td className="px-4 py-2 text-neutral-600">
                      {bill.date.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2">{bill.description ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-600">
                      {bill.job?.code ?? bill.overheadCategory?.name ?? "—"}
                      {bill.costCode ? ` — ${bill.costCode.code}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      <Money value={bill.amount} />
                    </td>
                    <td className="px-4 py-2">
                      <Money value={bill.paidAmount} />
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                          bill.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : bill.status === "partial"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {bill.status !== "paid" && (
                        <PayBillForm
                          billId={bill.id}
                          amountDue={amountDue.toFixed(2)}
                          cashAccounts={cashAccounts}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
