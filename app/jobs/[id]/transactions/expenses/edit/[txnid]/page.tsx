import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listCostCodes, listVendors } from "@/lib/queries";
import { ExpenseForm } from "../../new/ExpenseForm";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string; txnid: string }>;
}) {
  const { id, txnid } = await params;
  const bill = await prisma.bill.findUnique({ where: { txnid } });
  if (!bill || !bill.costCodeId) notFound();

  const [costCodes, vendors] = await Promise.all([listCostCodes(), listVendors()]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Expense</h2>
      <ExpenseForm
        jobId={Number(id)}
        costCodes={costCodes}
        vendors={vendors}
        initial={{
          txnid,
          vendorId: bill.vendorId,
          costCodeId: bill.costCodeId,
          amount: bill.amount.toFixed(2),
          retainageWithheld: bill.retainageWithheld.toFixed(2),
          date: bill.date.toISOString().slice(0, 10),
          description: bill.description ?? "",
        }}
      />
    </div>
  );
}
