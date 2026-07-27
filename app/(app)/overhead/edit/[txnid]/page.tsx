import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listVendors, listOverheadCategories } from "@/lib/queries";
import { OverheadExpenseForm } from "../../new/OverheadExpenseForm";

export default async function EditOverheadExpensePage({
  params,
}: {
  params: Promise<{ txnid: string }>;
}) {
  const { txnid } = await params;
  const bill = await prisma.bill.findUnique({ where: { txnid } });
  if (!bill || !bill.overheadCategoryId) notFound();

  const [vendors, categories] = await Promise.all([listVendors(), listOverheadCategories()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit Overhead Expense</h1>
      <OverheadExpenseForm
        vendors={vendors}
        categories={categories}
        initial={{
          txnid,
          vendorId: bill.vendorId,
          overheadCategoryId: bill.overheadCategoryId,
          amount: bill.amount.toFixed(2),
          date: bill.date.toISOString().slice(0, 10),
          description: bill.description ?? "",
        }}
      />
    </div>
  );
}
