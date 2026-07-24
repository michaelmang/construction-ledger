import { listCashAccounts } from "@/lib/queries";
import { PaymentForm } from "./PaymentForm";

export default async function NewPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cashAccounts = await listCashAccounts();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Record a Payment Received</h2>
      <PaymentForm jobId={Number(id)} cashAccounts={cashAccounts} />
    </div>
  );
}
