import { listCostCodes, listVendors, listActiveEmployees } from "@/lib/queries";
import { ExpenseForm } from "./ExpenseForm";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [costCodes, vendors, employeesRaw] = await Promise.all([
    listCostCodes(),
    listVendors(),
    listActiveEmployees(),
  ]);
  const employees = employeesRaw.map((e) => ({
    id: e.id,
    name: e.name,
    baseRate: e.baseRate.toString(),
    payrollTaxPct: e.payrollTaxPct.toString(),
    workersCompPct: e.workersCompPct.toString(),
    benefitsPct: e.benefitsPct.toString(),
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Record a Cost</h2>
      <ExpenseForm jobId={Number(id)} costCodes={costCodes} vendors={vendors} employees={employees} />
    </div>
  );
}
