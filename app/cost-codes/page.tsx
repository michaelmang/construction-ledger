import { listCostCodes } from "@/lib/queries";
import { CostCodeForm } from "./CostCodeForm";

export default async function CostCodesPage() {
  const costCodes = await listCostCodes();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cost Codes</h1>

      <CostCodeForm />

      {costCodes.length === 0 ? (
        <p className="text-neutral-500">No cost codes yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">CSI Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {costCodes.map((cc) => (
                <tr key={cc.id}>
                  <td className="px-4 py-2 font-medium">{cc.code}</td>
                  <td className="px-4 py-2">{cc.name}</td>
                  <td className="px-4 py-2 text-neutral-600">{cc.csiDivision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
