import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listCostCodes, listVendors, listActiveEmployees } from "@/lib/queries";
import { CostType } from "@/lib/cost-types";
import { ExpenseForm } from "../../new/ExpenseForm";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string; txnid: string }>;
}) {
  const { id, txnid } = await params;
  const bill = await prisma.bill.findUnique({ where: { txnid } });
  if (!bill || !bill.costCodeId) notFound();

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
      <h2 className="text-lg font-medium">Edit Expense</h2>
      <ExpenseForm
        jobId={Number(id)}
        costCodes={costCodes}
        vendors={vendors}
        employees={employees}
        initial={{
          txnid,
          vendorId: bill.vendorId,
          costCodeId: bill.costCodeId,
          // Pre-v3 bills have no costType until the backfill migration runs
          // (v3 build instructions Phase 4) — default to "other" so the form
          // still renders; saving requires picking a real value.
          costType: (bill.costType ?? "other") as CostType,
          amount: bill.amount.toFixed(2),
          retainageWithheld: bill.retainageWithheld.toFixed(2),
          date: bill.date.toISOString().slice(0, 10),
          description: bill.description ?? "",
        }}
      />
    </div>
  );
}
