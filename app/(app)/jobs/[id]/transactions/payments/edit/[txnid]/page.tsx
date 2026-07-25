import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { print } from "@/lib/hledger";
import { listCashAccounts } from "@/lib/queries";
import { PaymentForm } from "../../new/PaymentForm";

export default async function EditPaymentPage({
  params,
}: {
  params: Promise<{ id: string; txnid: string }>;
}) {
  const { id, txnid } = await params;
  const journalTxn = await prisma.journalTxn.findUnique({ where: { txnid } });
  if (!journalTxn || journalTxn.kind !== "payment") notFound();

  const [entries, cashAccounts] = await Promise.all([
    print([`tag:txnid=${txnid}`]),
    listCashAccounts(),
  ]);
  const entry = entries[0];
  if (!entry) notFound();

  // The cash account debited is whichever `assets:` posting isn't AR or
  // retainage receivable — JournalTxn doesn't store this directly.
  const cashPosting = entry.postings.find(
    (p) =>
      p.account.startsWith("assets:") &&
      !p.account.startsWith("assets:accounts receivable:") &&
      !p.account.startsWith("assets:retainage receivable:"),
  );
  const cashAccountName = cashPosting ? cashPosting.account.slice("assets:".length) : "checking";
  const cashAccountOptions = cashAccounts.map((a) => ({
    name: a.name,
    label: a.label,
    isDefault: a.isDefault,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Payment</h2>
      <PaymentForm
        jobId={Number(id)}
        cashAccounts={cashAccountOptions}
        unpaidBillings={[]}
        initial={{
          txnid,
          amount: journalTxn.amount.toFixed(2),
          date: journalTxn.date.toISOString().slice(0, 10),
          cashAccount: cashAccountName,
          memo: journalTxn.memo ?? "",
        }}
      />
    </div>
  );
}
