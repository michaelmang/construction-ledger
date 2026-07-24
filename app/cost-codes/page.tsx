import { listCostCodes } from "@/lib/queries";
import { CostCodeForm } from "./CostCodeForm";

export default async function CostCodesPage() {
  const costCodes = await listCostCodes();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cost Codes</h1>

      <CostCodeForm />

      {costCodes.length === 0 ? (
        <p className="text-text-3">No cost codes yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-3">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">CSI Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {costCodes.map((cc) => (
                <tr key={cc.id}>
                  <td className="px-4 py-2 font-medium">{cc.code}</td>
                  <td className="px-4 py-2">{cc.name}</td>
                  <td className="px-4 py-2 text-text-2">{cc.csiDivision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
