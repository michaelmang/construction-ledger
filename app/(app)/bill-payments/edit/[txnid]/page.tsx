import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { print } from "@/lib/hledger";
import { listCashAccounts } from "@/lib/queries";
import { BillPaymentForm } from "./BillPaymentForm";

export default async function EditBillPaymentPage({
  params,
}: {
  params: Promise<{ txnid: string }>;
}) {
  const { txnid } = await params;
  const payment = await prisma.billPayment.findUnique({
    where: { txnid },
    include: { bill: { include: { vendor: true } } },
  });
  if (!payment) notFound();

  const [entries, cashAccounts] = await Promise.all([
    print([`tag:txnid=${txnid}`]),
    listCashAccounts(),
  ]);
  const entry = entries[0];
  if (!entry) notFound();

  const cashPosting = entry.postings.find((p) => p.account.startsWith("assets:"));
  const cashAccountName = cashPosting ? cashPosting.account.slice("assets:".length) : "checking";
  const cashAccountOptions = cashAccounts.map((a) => ({
    name: a.name,
    label: a.label,
    isDefault: a.isDefault,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Bill Payment</h2>
      <BillPaymentForm
        billId={payment.billId}
        vendorName={payment.bill.vendor.name}
        cashAccounts={cashAccountOptions}
        initial={{
          txnid,
          amount: payment.amount.toFixed(2),
          date: payment.date.toISOString().slice(0, 10),
          cashAccount: cashAccountName,
        }}
      />
    </div>
  );
}
