import Decimal from "decimal.js";
import { listCashAccounts, listUnpaidBillings } from "@/lib/queries";
import { PaymentForm } from "./PaymentForm";

export default async function NewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const [cashAccounts, billings] = await Promise.all([
    listCashAccounts(),
    listUnpaidBillings(jobId),
  ]);

  const unpaidBillings = billings.map((b) => ({
    id: b.id,
    periodLabel: b.periodLabel,
    amountDue: new Decimal(b.amountBilled).minus(b.retainageWithheld).minus(b.paidAmount).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Record a Payment Received</h2>
      <PaymentForm jobId={jobId} cashAccounts={cashAccounts} unpaidBillings={unpaidBillings} />
    </div>
  );
}
