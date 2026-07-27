import {
  listCostCodes,
  listVendors,
  listActiveEmployees,
  toEmployeeOption,
  getCompanyAssumptions,
} from "@/lib/queries";
import { ExpenseForm } from "./ExpenseForm";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [costCodes, vendors, employeesRaw, company] = await Promise.all([
    listCostCodes(),
    listVendors(),
    listActiveEmployees(),
    getCompanyAssumptions(),
  ]);
  const employees = employeesRaw.map(toEmployeeOption);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Record a Cost</h2>
      <ExpenseForm
        jobId={Number(id)}
        costCodes={costCodes}
        vendors={vendors}
        employees={employees}
        company={company}
      />
    </div>
  );
}
