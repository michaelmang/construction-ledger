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

  const [bills, cashAccountsRaw] = await Promise.all([
    listBillsForVendor(vendorId),
    listCashAccounts(),
  ]);
  const cashAccounts = cashAccountsRaw.map((a) => ({
    name: a.name,
    label: a.label,
    isDefault: a.isDefault,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{vendor.name}</h1>

      {bills.length === 0 ? (
        <p className="text-text-3">No bills recorded for this vendor yet.</p>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
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
            <tbody className="divide-y divide-border">
              {bills.map((bill) => {
                const amountDue = new Decimal(bill.amount)
                  .minus(bill.retainageWithheld)
                  .minus(bill.paidAmount);
                return (
                  <tr key={bill.id}>
                    <td className="px-4 py-2 text-text-2">
                      {bill.date.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2">{bill.description ?? "—"}</td>
                    <td className="px-4 py-2 text-text-2">
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
                            ? "bg-positive-soft text-positive"
                            : bill.status === "partial"
                              ? "bg-warn-soft text-accent"
                              : "bg-surface-2 text-text-2"
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
