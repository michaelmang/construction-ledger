import { listVendors, listOverheadCategories } from "@/lib/queries";
import { OverheadExpenseForm } from "./OverheadExpenseForm";

export default async function NewOverheadExpensePage() {
  const [vendors, categories] = await Promise.all([listVendors(), listOverheadCategories()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Record Overhead Expense</h1>
      {categories.length === 0 ? (
        <p className="text-sm text-text-3">
          Add an overhead category first on the{" "}
          <a href="/overhead" className="underline">
            Overhead
          </a>{" "}
          page.
        </p>
      ) : (
        <OverheadExpenseForm vendors={vendors} categories={categories} />
      )}
    </div>
  );
}
