import { listCostCodes } from "@/lib/queries";
import { JobWizard } from "./JobWizard";

export default async function NewJobPage() {
  const costCodes = await listCostCodes();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New Job</h1>
      <JobWizard existingCostCodes={costCodes} />
    </div>
  );
}
