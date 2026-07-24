import Link from "next/link";
import { listOverheadCategories, listOverheadBills } from "@/lib/queries";
import { Money } from "@/components/Money";
import { OverheadCategoryForm } from "./OverheadCategoryForm";

export default async function OverheadPage() {
  const [categories, bills] = await Promise.all([listOverheadCategories(), listOverheadBills()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Overhead</h1>
        <Link
          href="/overhead/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Record Overhead Expense
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        Non-job expenses — office, insurance, fuel — so cash position and profitability
        reflect the whole business, not just job costs.
      </p>

      <OverheadCategoryForm />

      {categories.length === 0 ? (
        <p className="text-neutral-500">No overhead categories yet.</p>
      ) : (
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
              >
                {c.code} — {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {bills.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 text-neutral-600">{b.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/vendors/${b.vendorId}`} className="hover:underline">
                      {b.vendor.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{b.overheadCategory?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Money value={b.amount} />
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
