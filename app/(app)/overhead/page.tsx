import Link from "next/link";
import { listOverheadCategories, listOverheadBills } from "@/lib/queries";
import { Money } from "@/components/Money";
import { OverheadCategoryForm } from "./OverheadCategoryForm";
import { OverheadBillActions } from "./OverheadBillActions";
import { PageHeader } from "@/components/ui/PageHeader";
import { primaryButtonClass } from "@/components/form";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass, tdNumericClass } from "@/components/table";

export default async function OverheadPage() {
  const [categories, bills] = await Promise.all([listOverheadCategories(), listOverheadBills()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overhead"
        action={
          <Link href="/overhead/new" className={primaryButtonClass}>
            Record Overhead Expense
          </Link>
        }
      />
      <p className="text-sm text-text-3">
        Non-job expenses — office, insurance, fuel — so cash position and profitability
        reflect the whole business, not just job costs.
      </p>

      <OverheadCategoryForm />

      {categories.length === 0 ? (
        <p className="text-text-3">No overhead categories yet.</p>
      ) : (
        <div>
          <h2 className="mb-2 text-sm font-medium text-text-3">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text-2"
              >
                {c.code} — {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {bills.length > 0 && (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Date</th>
                <th className={thClass}>Vendor</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {bills.map((b) => (
                <tr key={b.id} className={trClass}>
                  <td className={tdClass}>{b.date.toISOString().slice(0, 10)}</td>
                  <td className={tdClass}>
                    <Link href={`/vendors/${b.vendorId}`} className="hover:underline">
                      {b.vendor.name}
                    </Link>
                  </td>
                  <td className={tdClass}>{b.overheadCategory?.name ?? "—"}</td>
                  <td className={tdNumericClass}>
                    <Money value={b.amount} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <OverheadBillActions txnid={b.txnid} paid={b.paidAmount.greaterThan(0)} />
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
