import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getJob } from "@/lib/queries";
import { BillingForm } from "../../new/BillingForm";

export default async function EditBillingPage({
  params,
}: {
  params: Promise<{ id: string; billingId: string }>;
}) {
  const { id, billingId } = await params;
  const jobId = Number(id);
  const [job, billing] = await Promise.all([
    getJob(jobId),
    prisma.progressBilling.findUnique({ where: { id: Number(billingId) } }),
  ]);
  if (!job || !billing || !billing.txnid) notFound();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Edit Progress Billing</h2>
      <BillingForm
        jobId={jobId}
        retainagePct={job.retainagePct.toString()}
        initial={{
          id: billing.id,
          txnid: billing.txnid,
          amountBilled: billing.amountBilled.toFixed(2),
          retainageWithheld: billing.retainageWithheld.toFixed(2),
          billingDate: billing.billingDate?.toISOString().slice(0, 10) ?? "",
          periodLabel: billing.periodLabel ?? "",
          pctCompleteEstimate: billing.pctCompleteEstimate?.toFixed(1) ?? "",
        }}
      />
    </div>
  );
}
