import { listCostCodes, listVendors } from "@/lib/queries";
import { ExpenseForm } from "./ExpenseForm";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [costCodes, vendors] = await Promise.all([listCostCodes(), listVendors()]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Record an Expense</h2>
      <ExpenseForm jobId={Number(id)} costCodes={costCodes} vendors={vendors} />
    </div>
  );
}
