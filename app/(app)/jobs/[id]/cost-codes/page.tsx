import { getCostCodeBreakdown, getCostTypePivotForJob } from "@/lib/reports";
import { listCostCodes } from "@/lib/queries";
import { CostCodeGrid } from "./CostCodeGrid";
import { CostTypePivotTable } from "./CostTypePivotTable";

export default async function JobCostCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  const [rows, allCostCodes, pivotRows] = await Promise.all([
    getCostCodeBreakdown(jobId),
    listCostCodes(),
    getCostTypePivotForJob(jobId),
  ]);

  const budgetedIds = new Set(rows.map((r) => r.costCodeId));
  const available = allCostCodes.filter((cc) => !budgetedIds.has(cc.id));

  const gridRows = rows.map((r) => ({
    costCodeId: r.costCodeId,
    costCode: r.costCode,
    costCodeName: r.costCodeName,
    budgeted: r.budgeted.toFixed(2),
    estimatedAtCompletion: r.estimatedAtCompletion.toFixed(2),
    actual: r.actual.toFixed(2),
    remaining: r.remaining.toFixed(2),
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className="text-sm text-text-2">
          Edit the revised estimate as costs firm up — the WIP schedule recomputes from
          whatever you save here.
        </p>
        {rows.length === 0 && available.length === 0 ? (
          <p className="text-text-3">No cost codes exist yet.</p>
        ) : (
          <CostCodeGrid jobId={jobId} rows={gridRows} available={available} />
        )}
      </div>

      {pivotRows.length > 0 && <CostTypePivotTable rows={pivotRows} />}
    </div>
  );
}
