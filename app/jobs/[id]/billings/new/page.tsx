import { notFound } from "next/navigation";
import { getJob } from "@/lib/queries";
import { BillingForm } from "./BillingForm";

export default async function NewBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(Number(id));
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Create Progress Billing</h2>
      <BillingForm jobId={job.id} retainagePct={job.retainagePct.toString()} />
    </div>
  );
}
